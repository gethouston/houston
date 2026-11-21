import type { CDPSession, Frame, Page } from "playwright-core";
import type { BrowserTab } from "../open-tab";
import { redactUrl } from "../redact-url";
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT } from "./layout";
import { warnUnlessClosed } from "./page-errors";

export interface ScreencastSink {
  frame(frame: { jpeg: string; width: number; height: number }): void;
  page(page: { url: string; title: string }): void;
}

const MAX_FRAME = {
  width: Math.max(DESKTOP_VIEWPORT.width, PHONE_VIEWPORT.width),
  height: Math.max(DESKTOP_VIEWPORT.height, PHONE_VIEWPORT.height),
};

const STILL_PAGE_MS = 400;

interface FrameEvent {
  data: string;
  sessionId: number;
  metadata: { deviceWidth: number; deviceHeight: number };
}

export class Screencast {
  private running = false;
  private generation = 0;
  private cdp: CDPSession | null = null;
  private shown: Page | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly follow = (page: Page) => {
    if (this.running) this.enqueue(() => this.attach(page));
  };
  private readonly navigated = (frame: Frame) => {
    if (frame === this.shown?.mainFrame()) this.enqueue(() => this.sendPage());
  };

  constructor(
    private readonly tab: BrowserTab,
    private readonly sink: ScreencastSink,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tab.onPageChange.add(this.follow);
    this.enqueue(() => this.attach(this.tab.page));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.tab.onPageChange.delete(this.follow);
    this.enqueue(() => this.release());
  }

  private enqueue(step: () => Promise<void>): void {
    this.chain = this.chain.then(step).catch(warnUnlessClosed("live view"));
  }

  private async attach(page: Page): Promise<void> {
    if (!this.running || page.isClosed()) return;
    if (page === this.shown && this.cdp) return;
    const session = await this.tab.context.newCDPSession(page);
    if (!this.running) {
      await session.detach();
      return;
    }
    this.generation += 1;
    const mine = this.generation;
    let painted = false;
    session.on("Page.screencastFrame", (event: FrameEvent) => {
      session
        .send("Page.screencastFrameAck", { sessionId: event.sessionId })
        .catch(warnUnlessClosed("frame ack"));
      if (mine !== this.generation) return;
      painted = true;
      this.sink.frame({
        jpeg: event.data,
        width: Math.round(event.metadata.deviceWidth),
        height: Math.round(event.metadata.deviceHeight),
      });
    });
    await this.release();
    this.shown = page;
    this.cdp = session;
    page.on("framenavigated", this.navigated);
    await page.bringToFront();
    await this.sendPage();
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 60,
      maxWidth: MAX_FRAME.width,
      maxHeight: MAX_FRAME.height,
      everyNthFrame: 1,
    });
    setTimeout(() => {
      if (mine !== this.generation || painted) return;
      this.stillFrame(session, page, mine).catch(
        warnUnlessClosed("still frame"),
      );
    }, STILL_PAGE_MS).unref();
  }

  private async stillFrame(
    session: CDPSession,
    page: Page,
    mine: number,
  ): Promise<void> {
    const shot = await session.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 60,
    });
    const size = page.viewportSize() ?? DESKTOP_VIEWPORT;
    if (mine === this.generation) this.sink.frame({ jpeg: shot.data, ...size });
  }

  private async sendPage(): Promise<void> {
    const page = this.shown;
    if (!page || page.isClosed()) return;
    const title = await page.title();
    if (page === this.shown)
      this.sink.page({ url: redactUrl(page.url()), title });
  }

  private async release(): Promise<void> {
    const old = this.cdp;
    this.shown?.off("framenavigated", this.navigated);
    this.cdp = null;
    this.shown = null;
    if (!old) return;
    await old.send("Page.stopScreencast").catch(warnUnlessClosed("stop"));
    await old.detach().catch(warnUnlessClosed("detach"));
  }
}
