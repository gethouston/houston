import { createHash, randomUUID } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
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
import { pruneMessageAdmissions } from "./message-admission-prune";

export type Admission =
  | { kind: "new"; turnId: string }
  | { kind: "duplicate"; turnId: string }
  | { kind: "conflict"; turnId: string }
  | { kind: "interrupted"; turnId: string };

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/**
 * How long a receipt keeps answering retries after its turn settled. Longer
 * than any client's retry horizon by orders of magnitude, and short enough that
 * the directory holds a week of messages rather than every message an assistant
 * ever received: a channel-mirrored assistant takes one receipt per inbound
 * message, on a data root that may be replicated.
 */
export const MESSAGE_ADMISSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Collection is housekeeping; once per hour of process life is plenty. */
export const MESSAGE_ADMISSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long an abandoned `.tmp` is left alone. A temporary is a receipt still
 * being published: it promises nothing and answers no retry, so it is held
 * only long enough to outlive the slowest write, never for a receipt's week.
 */
export const MESSAGE_ADMISSION_TEMPORARY_MS = 60 * 60 * 1000;

/**
 * Persist acceptance before execution. Receipts survive transcript rewind and
 * deletion: removing a conversation must never make an old request executable.
 * A receipt without a live owner or terminal transcript fails closed on retry.
 * This protects process restarts over the same data tree; asynchronous remote
 * replication is a separate durability boundary owned by the hosting service.
 *
 * A receipt outlives its turn on purpose — that is what answers a retry sent
 * after the answer was already written — so {@link MESSAGE_ADMISSION_RETENTION_MS}
 * is what ends its life, never settling.
 */
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
      // Corruption is uncertainty, never evidence that execution is safe.
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
    // Publish exclusively after flushing the complete record. A second runtime
    // cannot overwrite a winner; an abandoned temporary file admits nothing.
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

  /**
   * The collection this process last scheduled. Housekeeping is never the
   * settling turn's work, so a caller that must observe it (shutdown, tests)
   * waits here rather than on `settle`.
   */
  collected(): Promise<void> {
    return this.collecting;
  }

  private file(conversationId: string, nonce: string): string {
    return join(this.dataRoot, messageAdmissionFileName(conversationId, nonce));
  }

  /**
   * Housekeeping never fails a message, and never blocks one either: the scan
   * runs off the turn that scheduled it, one at a time. A receipt that outlives
   * its window refuses a retry that is decades stale at worst, while a thrown
   * collection error would reject the settled turn itself. The runtime log is
   * the report.
   */
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

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
