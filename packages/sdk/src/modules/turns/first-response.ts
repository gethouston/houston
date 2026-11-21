export type FirstResponseOutcome =
  | "first_text"
  | "no_text"
  | "error"
  | "cancelled"
  | "interrupted"
  | "timeout";

export interface FirstResponse {
  outcome: FirstResponseOutcome;
  sentAt: number;
  at: number;
  turnId?: string;
  firstActivityAt?: number;
}

export const FIRST_RESPONSE_TIMEOUT_MS = 600_000;

export class FirstResponseClock {
  readonly sentAt: number;
  private done = false;
  private firstActivityAt: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly report: (response: FirstResponse) => void,
    timeoutMs: number = FIRST_RESPONSE_TIMEOUT_MS,
  ) {
    this.sentAt = Date.now();
    this.timer = setTimeout(() => this.resolve("timeout"), timeoutMs);
    (this.timer as { unref?: () => void }).unref?.();
  }

  pushed(item: object, turnId?: string): void {
    if (this.done) return;
    if (this.firstActivityAt === undefined && isVisibleActivity(item))
      this.firstActivityAt = Date.now();
    if (isVisibleAssistantText(item)) this.resolve("first_text", turnId);
  }

  resolve(outcome: FirstResponseOutcome, turnId?: string): void {
    if (this.done) return;
    this.done = true;
    this.clearTimer();
    const at = this.firstActivityAt;
    this.report({
      outcome,
      sentAt: this.sentAt,
      at: Date.now(),
      ...(turnId === undefined ? {} : { turnId }),
      ...(at === undefined ? {} : { firstActivityAt: at }),
    });
  }

  dispose(): void {
    this.done = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export function isVisibleActivity(item: object): boolean {
  const it = item as { feed_type?: unknown; data?: unknown };
  if (it.feed_type === "tool_call") return true;
  if (it.feed_type === "thinking_streaming" || it.feed_type === "thinking")
    return typeof it.data === "string" && it.data.trim() !== "";
  return isVisibleAssistantText(item);
}

export function isVisibleAssistantText(item: object): boolean {
  const it = item as { feed_type?: unknown; data?: unknown };
  return (
    (it.feed_type === "assistant_text_streaming" ||
      it.feed_type === "assistant_text") &&
    typeof it.data === "string" &&
    it.data.trim() !== ""
  );
}
