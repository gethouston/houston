import { createHash, randomUUID } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  isMessageAdmissionReceipt,
  MESSAGE_ADMISSIONS_DIRECTORY,
  type MessageAdmissionReceipt,
} from "@houston/protocol";
import { messageAdmissionFileName } from "@houston/protocol/message-admission-file";
import { hasCode } from "./fs-error-code";
import { pruneMessageAdmissions } from "./message-admission-prune";

export type Admission =
  | { kind: "new"; turnId: string }
  | { kind: "duplicate"; turnId: string }
  | { kind: "conflict"; turnId: string }
  | { kind: "interrupted"; turnId: string };

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const MESSAGE_ADMISSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const MESSAGE_ADMISSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export const MESSAGE_ADMISSION_TEMPORARY_MS = 60 * 60 * 1000;

export class MessageAdmissions {
  private readonly active = new Set<string>();
  private readonly directory: string;
  private prunedAt: number;
  private collecting: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataRoot: string,
    private readonly completed: (
      conversationId: string,
      turnId: string,
    ) => boolean,
    private readonly now: () => number = Date.now,
  ) {
    this.directory = join(dataRoot, MESSAGE_ADMISSIONS_DIRECTORY);
    this.prunedAt = now();
    this.collect();
  }

  inspect(
    conversationId: string,
    nonce: string,
    fingerprint: string,
  ): Admission | null {
    const file = this.file(conversationId, nonce);
    let receipt: MessageAdmissionReceipt;
    try {
      const value: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (!isMessageAdmissionReceipt(value))
        throw new Error("Invalid message admission receipt");
      receipt = value;
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    }
    if (receipt.fingerprint !== fingerprint)
      return { kind: "conflict", turnId: receipt.turnId };
    return {
      kind:
        this.active.has(file) || this.completed(conversationId, receipt.turnId)
          ? "duplicate"
          : "interrupted",
      turnId: receipt.turnId,
    };
  }

  accept(
    conversationId: string,
    nonce: string,
    fingerprint: string,
    hostFingerprint?: string,
  ): Admission {
    const previous = this.inspect(conversationId, nonce, fingerprint);
    if (previous) return previous;
    mkdirSync(this.directory, { recursive: true });
    const file = this.file(conversationId, nonce);
    const receipt: MessageAdmissionReceipt = {
      version: 1,
      fingerprint,
      turnId: randomUUID(),
      ...(hostFingerprint ? { hostFingerprint } : {}),
    };
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(receipt), {
      flag: "wx",
      flush: true,
    });
    try {
      linkSync(temporary, file);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      const winner = this.inspect(conversationId, nonce, fingerprint);
      if (!winner)
        throw new Error("Message admission disappeared during acceptance");
      return winner;
    } finally {
      unlinkSync(temporary);
    }
    this.active.add(file);
    return { kind: "new", turnId: receipt.turnId };
  }

  settle(conversationId: string, nonce: string): void {
    this.active.delete(this.file(conversationId, nonce));
    if (this.now() - this.prunedAt >= MESSAGE_ADMISSION_PRUNE_INTERVAL_MS)
      this.collect();
  }

  release(conversationId: string, nonce: string): void {
    const file = this.file(conversationId, nonce);
    this.active.delete(file);
    rmSync(file, { force: true });
  }

  collected(): Promise<void> {
    return this.collecting;
  }

  private file(conversationId: string, nonce: string): string {
    return join(this.dataRoot, messageAdmissionFileName(conversationId, nonce));
  }

  private collect(): void {
    const at = this.now();
    this.prunedAt = at;
    this.collecting = this.collecting
      .then(() =>
        pruneMessageAdmissions({
          directory: this.directory,
          deadline: at - MESSAGE_ADMISSION_RETENTION_MS,
          temporaryDeadline: at - MESSAGE_ADMISSION_TEMPORARY_MS,
          isActive: (file) => this.active.has(file),
        }),
      )
      .catch((error: unknown) => {
        console.error("[message-admissions] receipt collection failed", error);
      });
  }
}

export function messageFingerprint(values: readonly unknown[]): string {
  return digest(JSON.stringify(values));
}
