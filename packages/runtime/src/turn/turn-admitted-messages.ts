import type { MessageAdmissionReceipt } from "@houston/protocol";
import { MESSAGE_ADMISSION_RETENTION_MS } from "../store/message-admissions";

interface Admitted {
  hostFingerprint: string;
  turnId: string;
  at: number;
}

export class AdmittedMessages {
  private readonly byNonce: Map<string, Admitted>;

  constructor(
    carried: unknown,
    private readonly now: () => number = Date.now,
  ) {
    this.byNonce = new Map();
    if (typeof carried !== "object" || carried === null) return;
    for (const [nonce, value] of Object.entries(carried)) {
      const entry = value as Partial<Admitted>;
      if (
        typeof entry.hostFingerprint === "string" &&
        typeof entry.turnId === "string" &&
        entry.turnId !== "" &&
        typeof entry.at === "number" &&
        this.now() - entry.at < MESSAGE_ADMISSION_RETENTION_MS
      )
        this.byNonce.set(nonce, {
          hostFingerprint: entry.hostFingerprint,
          turnId: entry.turnId,
          at: entry.at,
        });
    }
  }

  receipt(nonce: string): MessageAdmissionReceipt | null {
    const entry = this.byNonce.get(nonce);
    return entry
      ? {
          version: 1,
          fingerprint: entry.hostFingerprint,
          hostFingerprint: entry.hostFingerprint,
          turnId: entry.turnId,
        }
      : null;
  }

  record(nonce: string, hostFingerprint: string, turnId: string): void {
    this.byNonce.set(nonce, { hostFingerprint, turnId, at: this.now() });
  }

  toJSON(): Record<string, Admitted> {
    return Object.fromEntries(
      [...this.byNonce].filter(
        ([, entry]) => this.now() - entry.at < MESSAGE_ADMISSION_RETENTION_MS,
      ),
    );
  }
}
