/**
 * How long the page sat hidden before the board painted. Browsers throttle a
 * hidden page and nobody waits on it, so that time comes off the load the
 * gateway sees; a page that OPENED hidden (a background tab) has no honest
 * load time at all.
 *
 * On the web this module loads with the lazy app chunk, well after T0, so a
 * switch away during the chunk download already happened. The browser's
 * `visibility-state` performance entries (Chromium) replay it from T0; where
 * there are none (Safari, Firefox, WKWebView) the state at construction is all
 * there is, and a page hidden then is taken to have opened hidden.
 */

export type VisibilityDoc = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/** The slice of `performance` that replays visibility from T0. */
export interface VisibilityTimeline {
  timeOrigin: number;
  getEntriesByType?(
    type: string,
  ): ReadonlyArray<{ name: string; startTime: number }>;
}

export interface HiddenSummary {
  hiddenMs: number;
  openedHidden: boolean;
}

export class HiddenTime {
  private hiddenMs = 0;
  private hiddenSince: number | null = null;
  private readonly openedHidden: boolean;
  private readonly detach: () => void = () => {};

  constructor(
    doc: VisibilityDoc | undefined,
    timeline: VisibilityTimeline | undefined,
    private readonly now: () => number,
  ) {
    const entries = timeline?.getEntriesByType?.("visibility-state") ?? [];
    if (timeline && entries.length > 0) {
      // The first entry is the state at time 0, then one per change.
      this.openedHidden = entries[0]?.name === "hidden";
      for (const entry of entries)
        this.mark(
          entry.name === "hidden",
          timeline.timeOrigin + entry.startTime,
        );
    } else {
      this.openedHidden = doc?.visibilityState === "hidden";
      if (this.openedHidden) this.hiddenSince = timeline?.timeOrigin ?? now();
    }
    if (!doc) return;
    const onChange = () => this.mark(doc.visibilityState === "hidden", now());
    doc.addEventListener("visibilitychange", onChange);
    this.detach = () => doc.removeEventListener("visibilitychange", onChange);
  }

  /** The hidden time up to `at`; stops listening, since only the first paint asks. */
  finish(at: number = this.now()): HiddenSummary {
    this.detach();
    const open = this.hiddenSince === null ? 0 : at - this.hiddenSince;
    return {
      hiddenMs: Math.max(0, Math.round(this.hiddenMs + open)),
      openedHidden: this.openedHidden,
    };
  }

  private mark(hidden: boolean, at: number): void {
    if (hidden) {
      this.hiddenSince ??= at;
      return;
    }
    if (this.hiddenSince === null) return;
    this.hiddenMs += Math.max(0, at - this.hiddenSince);
    this.hiddenSince = null;
  }
}
