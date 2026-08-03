/**
 * Client UX timing spans (HOU-1011). Measures the four cold-journey timings —
 * app open → board cards painted, card click → chat painted, message send →
 * first agent output, app open → first output of the session — and ships them
 * to the gateway's `/v1/client-metrics` ingest (Prometheus histograms behind
 * grafana.gethouston.ai) plus a PostHog mirror for per-user drill-down.
 *
 * Pure module: no React, no Tauri, no fetch of its own until `configure()`
 * injects the transport. All clocks are epoch ms (performance.timeOrigin as
 * the web T0; the Tauri shell upgrades T0 to its process start).
 */

export type PerfSpanName =
  | "app_to_board"
  | "card_click_to_chat"
  | "send_to_first_response"
  | "app_to_first_response";

export interface PerfSpanObservation {
  span: PerfSpanName;
  ms: number;
}

export interface PerfSpanTransport {
  /** POST a batch to the gateway; absent session → don't call configure yet. */
  send(spans: PerfSpanObservation[]): Promise<void>;
  /** Per-span mirror (PostHog). Fire-and-forget. */
  mirror?(span: PerfSpanName, ms: number): void;
}

/** Marks older than this are stale (user wandered off) — never completed. */
const PENDING_TTL_MS = 60_000;
const FLUSH_DELAY_MS = 5_000;

export class PerfSpans {
  private t0Ms: number;
  private readonly onceDone = new Set<PerfSpanName>();
  private pendingChatOpenAt: number | null = null;
  private pendingSendAt: number | null = null;
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

  /** The Tauri shell's process-start stamp — earlier than the webview's. */
  setLaunchT0(epochMs: number): void {
    // Only ever move T0 earlier: a late (buggy) stamp must not shrink spans.
    if (Number.isFinite(epochMs) && epochMs < this.t0Ms) this.t0Ms = epochMs;
  }

  configure(transport: PerfSpanTransport): void {
    this.transport = transport;
    if (this.queue.length > 0) this.scheduleFlush();
  }

  /** Mission cards painted with resolved data. Once per app session. */
  boardRendered(): void {
    this.observeOnce("app_to_board", this.now() - this.t0Ms);
  }

  /** The user opened a mission card (chat panel about to load). */
  cardClicked(): void {
    this.pendingChatOpenAt = this.now();
  }

  /** The opened conversation's messages painted. Completes cardClicked. */
  chatRendered(): void {
    const at = this.take(this.pendingChatOpenAt);
    this.pendingChatOpenAt = null;
    if (at !== null) this.observe("card_click_to_chat", this.now() - at);
  }

  /** The user sent a message. Overwrites an unanswered previous send. */
  messageSent(): void {
    this.pendingSendAt = this.now();
  }

  /** First agent output (first streamed word) became visible. */
  firstAssistantOutput(): void {
    const at = this.take(this.pendingSendAt);
    this.pendingSendAt = null;
    if (at !== null) {
      this.observe("send_to_first_response", this.now() - at);
      this.observeOnce("app_to_first_response", this.now() - this.t0Ms);
    }
  }

  /** Ship anything queued now (page-hide, tests). */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.transport || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      await this.transport.send(batch);
    } catch {
      // Re-queue once so a transient network blip isn't a lost sample; a
      // second failure drops the batch (metrics are best-effort, never noise).
      if (batch.length + this.queue.length <= 40) this.queue.unshift(...batch);
    }
  }

  private take(at: number | null): number | null {
    if (at === null) return null;
    return this.now() - at <= PENDING_TTL_MS ? at : null;
  }

  private observeOnce(span: PerfSpanName, ms: number): void {
    if (this.onceDone.has(span)) return;
    this.onceDone.add(span);
    this.observe(span, ms);
  }

  private observe(span: PerfSpanName, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.queue.push({ span, ms: Math.round(ms) });
    this.transport?.mirror?.(span, Math.round(ms));
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.transport || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
    // Never keep the process alive for a metrics flush (tests, shutdown).
    (this.flushTimer as { unref?: () => void }).unref?.();
  }
}

/** The app-wide singleton the wiring hook and call sites share. */
export const perfSpans = new PerfSpans();
