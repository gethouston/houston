/**
 * Client UX timing spans (HOU-1011). Measures app open → board cards painted,
 * card click → chat painted, and for every sent turn send → first visible text
 * and send → first visible activity (thinking, a tool call, or text), and ships them
 * to the gateway's `/v1/client-metrics` ingest (Prometheus histograms behind
 * grafana.gethouston.ai) plus a PostHog mirror for per-user drill-down. Only
 * the mirror carries the hosted org slug and the send's outcome: the gateway
 * ingest rejects unknown fields, and its histograms stay without org labels.
 * Which `app_to_board` spans are load times, and how much of one was a hidden
 * page: `perf-span-board.ts`.
 *
 * The send spans are not paired here: the SDK reports each sent turn's first
 * response (`FirstResponse`, from that turn's own frames), and this module
 * only turns the report into spans. Every turn the client sends is measured,
 * whichever surface sent it, and a slow or failed one is kept with its outcome.
 *
 * Pure module: no React, no Tauri, no fetch of its own until `configure()`
 * injects the transport. All clocks are epoch ms (performance.timeOrigin as
 * the web T0; the Tauri shell upgrades T0 to its process start).
 */

import type { FirstResponse } from "@houston/sdk";
import { BoardLoad } from "./perf-span-board";
import { turnSpans } from "./perf-span-marks";
import { OrgHistory } from "./perf-span-org-history";
import { SpanQueue } from "./perf-span-queue";
import type {
  PerfSpanName,
  PerfSpanTags,
  PerfSpanTransport,
} from "./perf-span-types";
import {
  HiddenTime,
  type VisibilityDoc,
  type VisibilityTimeline,
} from "./perf-span-visibility";

export type {
  PerfSpanName,
  PerfSpanObservation,
  PerfSpanTags,
  PerfSpanTransport,
} from "./perf-span-types";

/** A card click older than this is stale (user wandered off) — never completed. */
const PENDING_TTL_MS = 60_000;

export class PerfSpans {
  private t0Ms: number;
  private boardDone = false;
  private pendingChatOpenAt: number | null = null;
  private readonly orgs = new OrgHistory();
  private readonly queue = new SpanQueue();
  private transport: PerfSpanTransport | null = null;
  private readonly now: () => number;
  private readonly boardLoad: BoardLoad;

  constructor(opts?: {
    t0Ms?: number;
    now?: () => number;
    doc?: VisibilityDoc;
    timeline?: VisibilityTimeline;
  }) {
    this.now = opts?.now ?? Date.now;
    const timeline =
      opts?.timeline ??
      (typeof performance !== "undefined" ? performance : undefined);
    this.boardLoad = new BoardLoad(
      new HiddenTime(
        opts?.doc ?? (typeof document !== "undefined" ? document : undefined),
        timeline,
        this.now,
      ),
    );
    this.t0Ms = opts?.t0Ms ?? timeline?.timeOrigin ?? this.now();
  }

  /** The Tauri shell's process-start stamp — earlier than the webview's. */
  setLaunchT0(epochMs: number): void {
    // Only ever move T0 earlier: a late (buggy) stamp must not shrink spans.
    if (Number.isFinite(epochMs) && epochMs < this.t0Ms) this.t0Ms = epochMs;
  }

  configure(transport: PerfSpanTransport): void {
    this.transport = transport;
    this.queue.configure(transport);
  }

  /** The sign-in screen showed this session. */
  signInShown(): void {
    this.boardLoad.signInShown();
  }

  /** The first-run onboarding showed this session. */
  onboardingShown(): void {
    this.boardLoad.onboardingShown();
  }

  /** The screen the shell first painted after launch; later calls are ignored. */
  landedOn(screen: string): void {
    this.boardLoad.landedOn(screen);
  }

  /**
   * Mission cards painted with resolved data. Once per app session: PostHog
   * gets the whole span, the gateway its active part, and only for a load.
   */
  boardRendered(): void {
    if (this.boardDone) return;
    this.boardDone = true;
    const at = this.now();
    const totalMs = at - this.t0Ms;
    const board = this.boardLoad.finish(totalMs, at);
    const tags = { orgSlug: null, board: board.tags };
    this.observe("app_to_board", totalMs, tags, false);
    if (board.ship) this.queue.push("app_to_board", board.activeMs);
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

  /** The hosted org slug of the active space from now on, or null where there is none. */
  setOrgSlug(slug: string | null): void {
    this.orgs.set(slug, this.now());
  }

  /** The org a send dispatched at `at` (epoch ms) ran in. */
  orgSlugAt(at: number): string | null {
    return this.orgs.at(at);
  }

  /**
   * A sent turn's first response, as the SDK paired it:
   * `send_to_first_response` with its outcome, and `send_to_first_activity`
   * when the turn showed anything (or timed out showing nothing, censored like
   * a text timeout). Which outcomes ship to the gateway: `perf-span-marks.ts`.
   * Tagged with the org the turn was SENT in.
   */
  turnResponded(response: FirstResponse): void {
    const { outcome, sentAt } = response;
    const tags: PerfSpanTags = { orgSlug: this.orgs.at(sentAt), outcome };
    for (const { span, ms, ship } of turnSpans(response))
      this.observe(span, ms, tags, ship);
  }

  /** Ship anything queued now (page-hide, tests). */
  flush(): Promise<void> {
    return this.queue.flush();
  }

  private take(at: number | null): number | null {
    if (at === null) return null;
    return this.now() - at <= PENDING_TTL_MS ? at : null;
  }

  /** `ship: false` mirrors the span to PostHog only (never the gateway histogram). */
  private observe(
    span: PerfSpanName,
    ms: number,
    tags: PerfSpanTags = { orgSlug: null },
    ship = true,
  ): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.transport?.mirror?.(span, Math.round(ms), tags);
    if (ship) this.queue.push(span, ms);
  }
}

/** The app-wide singleton the wiring hook and call sites share. */
export const perfSpans = new PerfSpans();
