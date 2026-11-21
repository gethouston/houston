import { randomUUID } from "node:crypto";
import type {
  BrowserHandoffEnd,
  BrowserHandoffState,
  BrowserLiveEvent,
  BrowserLiveFrame,
  BrowserLiveInput,
  BrowserLiveLayout,
  BrowserLivePage,
  BrowserLiveStatus,
} from "@houston/wire-types";
import type { BrowserTab } from "../open-tab";
import { type InputOutcome, LiveInput } from "./input";
import { applyLayout } from "./layout";
import { warnUnlessClosed } from "./page-errors";
import { Screencast } from "./screencast";
import { VIEWER_WINDOW, ViewerWindow } from "./viewer-window";

export interface HandoffInit {
  conversationId: string;
  text: string;
  owner?: string;
  tab: BrowserTab;
  limitMs: number;
  touch?: () => void;
  now?: () => number;
}

export class HandoffSession {
  readonly conversationId: string;
  readonly handoffId = randomUUID();
  readonly text: string;
  readonly owner: string | undefined;
  readonly expiresAt: number;
  readonly tab: BrowserTab;
  readonly ended: Promise<BrowserHandoffEnd>;
  state: BrowserHandoffState = "waiting";
  private settle: (end: BrowserHandoffEnd) => void = () => undefined;
  private readonly viewers = new Map<string, ViewerWindow>();
  private readonly screencast: Screencast;
  private readonly input: LiveInput;
  private readonly touch: () => void;
  private readonly deadline: NodeJS.Timeout;
  private latestFrame: BrowserLiveFrame | null = null;
  private latestPage: BrowserLivePage | null = null;
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly applied = new Map<string, number>();

  constructor(init: HandoffInit) {
    this.conversationId = init.conversationId;
    this.text = init.text;
    this.owner = init.owner;
    this.tab = init.tab;
    this.touch = init.touch ?? (() => undefined);
    this.expiresAt = (init.now ?? Date.now)() + init.limitMs;
    this.ended = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.input = new LiveInput(init.tab);
    this.screencast = new Screencast(init.tab, {
      frame: (frame) => this.broadcastFrame(frame),
      page: (page) => this.broadcastPage(page),
    });
    this.deadline = setTimeout(() => this.finish("expired"), init.limitMs);
    this.deadline.unref();
  }

  status(): BrowserLiveStatus {
    return {
      type: "status",
      handoffId: this.handoffId,
      state: this.state,
      text: this.text,
      expiresAt: this.expiresAt,
      window: VIEWER_WINDOW,
    };
  }

  finish(end: BrowserHandoffEnd): void {
    if (this.state !== "waiting") return;
    this.state = end;
    clearTimeout(this.deadline);
    this.screencast.stop();
    this.input.close().catch(warnUnlessClosed("input close"));
    const status = this.status();
    for (const viewer of this.viewers.values()) viewer.event(status);
    this.viewers.clear();
    this.settle(end);
  }

  attachViewer(
    viewer: string,
    layout: BrowserLiveLayout,
    write: (event: BrowserLiveEvent) => boolean,
  ): () => void {
    const stream = new ViewerWindow(write);
    stream.event(this.status());
    if (this.state !== "waiting") return () => undefined;
    this.viewers.set(viewer, stream);
    if (this.latestPage) stream.event(this.latestPage);
    if (this.latestFrame) stream.replay(this.latestFrame);
    if (layout !== this.tab.layout)
      applyLayout(this.tab, layout).catch(warnUnlessClosed("layout"));
    this.screencast.start();
    return () => {
      if (this.viewers.get(viewer) !== stream) return;
      this.viewers.delete(viewer);
      if (this.viewers.size === 0) this.screencast.stop();
    };
  }

  ack(viewer: string, seq: number): void {
    this.viewers.get(viewer)?.ack(seq);
  }

  apply(
    events: readonly BrowserLiveInput[],
    batch?: { viewer: string; seq: number },
  ): Promise<InputOutcome> {
    const run = this.chain.then((): InputOutcome | Promise<InputOutcome> => {
      if (this.state !== "waiting" || !this.firstApply(batch)) return {};
      this.touch();
      return this.input.apply(events);
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private firstApply(batch?: { viewer: string; seq: number }): boolean {
    if (!batch) return true;
    if (batch.seq <= (this.applied.get(batch.viewer) ?? 0)) return false;
    this.applied.set(batch.viewer, batch.seq);
    return true;
  }

  private broadcastFrame(shot: Omit<BrowserLiveFrame, "type" | "seq">): void {
    this.seq += 1;
    const frame: BrowserLiveFrame = { type: "frame", seq: this.seq, ...shot };
    this.latestFrame = frame;
    for (const viewer of this.viewers.values()) viewer.frame(frame);
  }

  private broadcastPage(page: { url: string; title: string }): void {
    const event: BrowserLivePage = { type: "page", ...page };
    this.latestPage = event;
    for (const viewer of this.viewers.values()) viewer.event(event);
  }
}
