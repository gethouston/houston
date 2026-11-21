export type UpdateDownloadFailureKind =
  | "network"
  | "upstream"
  | "http"
  | "signature"
  | "in_progress"
  | "storage_full"
  | "other";

export interface UpdateDownloadFailure {
  kind: UpdateDownloadFailureKind;
  message: string;
  received: number;
  total: number | null;
  attempts: number;
  status?: number | null;
}

export class UpdateDownloadError extends Error {
  readonly kind: UpdateDownloadFailureKind;
  readonly received: number;
  readonly total: number | null;
  readonly attempts: number;
  readonly status: number | null;

  constructor(failure: UpdateDownloadFailure) {
    super(describeDownloadFailure(failure));
    this.name = "UpdateDownloadError";
    this.kind = failure.kind;
    this.received = failure.received;
    this.total = failure.total;
    this.attempts = failure.attempts;
    this.status = failure.status ?? null;
  }
}

const KINDS: ReadonlySet<string> = new Set([
  "network",
  "upstream",
  "http",
  "signature",
  "in_progress",
  "storage_full",
  "other",
]);

export type UpdateDownloadOutcome = "skip" | "give_up" | "retry";

export function updateDownloadOutcome(err: unknown): UpdateDownloadOutcome {
  const kind = toUpdateDownloadError(err).kind;
  if (kind === "in_progress") return "skip";
  if (kind === "storage_full") return "give_up";
  return "retry";
}

export function toUpdateDownloadError(err: unknown): UpdateDownloadError {
  if (err instanceof UpdateDownloadError) return err;
  if (err !== null && typeof err === "object" && "kind" in err) {
    const raw = err as Record<string, unknown>;
    const kind = typeof raw.kind === "string" && KINDS.has(raw.kind);
    if (kind && typeof raw.message === "string") {
      return new UpdateDownloadError({
        kind: raw.kind as UpdateDownloadFailureKind,
        message: raw.message,
        received: typeof raw.received === "number" ? raw.received : 0,
        total: typeof raw.total === "number" ? raw.total : null,
        attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
        status: typeof raw.status === "number" ? raw.status : null,
      });
    }
  }
  return new UpdateDownloadError({
    kind: "other",
    message: err instanceof Error ? err.message : String(err),
    received: 0,
    total: null,
    attempts: 0,
  });
}

export function describeDownloadFailure(
  failure: UpdateDownloadFailure,
): string {
  const total = failure.total === null ? "?" : String(failure.total);
  const attempts =
    failure.attempts > 0 ? ` after ${failure.attempts} attempts` : "";
  return `stopped at ${failure.received}/${total} bytes${attempts}: ${failure.message}`;
}

const NETWORK_SHAPED =
  /error sending request|error decoding response body|dns error|connection (reset|refused|closed|aborted)|operation timed out|timed out|network is unreachable|no route to host|tls handshake|certificate|broken pipe|unexpected eof|incomplete message/i;

export function isUpdateNetworkFailure(message: string): boolean {
  return NETWORK_SHAPED.test(message);
}
