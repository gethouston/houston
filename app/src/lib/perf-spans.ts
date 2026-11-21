import type { FirstResponse, FirstResponseOutcome } from "@houston/sdk";
import { turnSpans } from "./perf-span-marks";
import { OrgHistory } from "./perf-span-org-history";

export type PerfSpanName =
  | "app_to_board"
  | "card_click_to_chat"
  | "send_to_first_response"
  | "send_to_first_activity";

export interface PerfSpanObservation {
  span: PerfSpanName;
  ms: number;
}

export interface PerfSpanTags {
  orgSlug: string | null;
  outcome?: FirstResponseOutcome;
}

export interface PerfSpanTransport {
  send?(spans: PerfSpanObservation[]): Promise<void>;
  mirror?(span: PerfSpanName, ms: number, tags: PerfSpanTags): void;
}

const PENDING_TTL_MS = 60_000;
const FLUSH_DELAY_MS = 5_000;

export class PerfSpans {
  private t0Ms: number;
  private readonly onceDone = new Set<PerfSpanName>();
  private pendingChatOpenAt: number | null = null;
  private readonly orgs = new OrgHistory();
  private queue: PerfSpanObservation[] = [];
  private transport: PerfSpanTransport | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;

  constructor(opts?: { t0Ms?: number; now?: () => number }) {
    this.now = opts?.now ?? Date.now;
    this.t0Ms =
      opts?.t0Ms ??
      (typeof performance !== "undefined"
        ? performance.timeOrigin
        : this.now());
  }

  setLaunchT0(epochMs: number): void {
    if (Number.isFinite(epochMs) && epochMs < this.t0Ms) this.t0Ms = epochMs;
  }

  configure(transport: PerfSpanTransport): void {
    this.transport = transport;
    if (this.queue.length > 0) this.scheduleFlush();
  }

  boardRendered(): void {
    this.observeOnce("app_to_board", this.now() - this.t0Ms);
  }

  cardClicked(): void {
    this.pendingChatOpenAt = this.now();
  }

  chatRendered(): void {
    const at = this.take(this.pendingChatOpenAt);
    this.pendingChatOpenAt = null;
    if (at !== null) this.observe("card_click_to_chat", this.now() - at);
  }

  setOrgSlug(slug: string | null): void {
    this.orgs.set(slug, this.now());
  }

  orgSlugAt(at: number): string | null {
    return this.orgs.at(at);
  }

  turnResponded(response: FirstResponse): void {
    const { outcome, sentAt } = response;
    const tags: PerfSpanTags = { orgSlug: this.orgs.at(sentAt), outcome };
    for (const { span, ms, ship } of turnSpans(response))
      this.observe(span, ms, tags, ship);
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.transport || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    if (!this.transport.send) return;
    try {
      await this.transport.send(batch);
    } catch {
      if (batch.length + this.queue.length <= 40) this.queue.unshift(...batch);
    }
  }

  private take(at: number | null): number | null {
    if (at === null) return null;
    return this.now() - at <= PENDING_TTL_MS ? at : null;
  }

  private observeOnce(
    span: PerfSpanName,
    ms: number,
    tags: PerfSpanTags = { orgSlug: null },
  ): void {
    if (this.onceDone.has(span)) return;
    this.onceDone.add(span);
    this.observe(span, ms, tags);
  }

  private observe(
    span: PerfSpanName,
    ms: number,
    tags: PerfSpanTags = { orgSlug: null },
    ship = true,
  ): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.transport?.mirror?.(span, Math.round(ms), tags);
    if (!ship) return;
    this.queue.push({ span, ms: Math.round(ms) });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.transport || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
    (this.flushTimer as { unref?: () => void }).unref?.();
  }
}

export const perfSpans = new PerfSpans();
