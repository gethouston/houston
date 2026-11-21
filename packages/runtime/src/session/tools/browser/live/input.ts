import type { BrowserLiveInput } from "@houston/wire-types";
import type { CDPSession, Page } from "playwright-core";
import { BrowserToolError } from "../errors";
import type { BrowserTab } from "../open-tab";
import { checkBrowserUrl } from "../url-policy";
import { CDP_STEP_MS, within } from "./cdp-step";
import { keyPress, mouseSteps } from "./keys";
import { DESKTOP_VIEWPORT } from "./layout";
import { isNavigation, NavigationBudget } from "./navigation-budget";
import { isClosedError, warnUnlessClosed } from "./page-errors";

export interface InputOutcome {
  refused?: "url_refused";
}

class InputClosedError extends Error {}

export class LiveInput {
  private bound: { page: Page; session: Promise<CDPSession> } | null = null;
  private closed = false;

  constructor(
    private readonly tab: BrowserTab,
    private readonly stepMs = CDP_STEP_MS,
    private readonly budget = new NavigationBudget(),
  ) {}

  async apply(events: readonly BrowserLiveInput[]): Promise<InputOutcome> {
    let outcome: InputOutcome = {};
    this.budget.restart();
    let skipped = 0;
    for (const event of events) {
      if (this.closed) break;
      if (isNavigation(event) && this.budget.spent()) {
        skipped += 1;
        continue;
      }
      try {
        if ((await this.one(event)) === "url_refused")
          outcome = { refused: "url_refused" };
      } catch (error) {
        if (error instanceof InputClosedError) break;
        if (!isClosedError(error)) throw error;
        this.bound = null;
      }
    }
    if (skipped > 0)
      console.warn(
        `[browser] live view batch ran out of navigation time: skipped ${skipped} navigation(s)`,
      );
    return outcome;
  }

  private async send(
    ...[method, params]: Parameters<CDPSession["send"]>
  ): Promise<void> {
    const cdp = await this.session();
    await within(cdp.send(method, params), method, this.stepMs);
  }

  private async one(
    event: BrowserLiveInput,
  ): Promise<"url_refused" | undefined> {
    switch (event.type) {
      case "mouse":
        await this.mouse(event);
        return undefined;
      case "wheel":
        await this.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          ...this.px(event),
          deltaX: event.dx,
          deltaY: event.dy,
        });
        return;
      case "key":
        for (const params of keyPress(event.key, event.modifiers ?? 0))
          await this.send("Input.dispatchKeyEvent", params);
        return;
      case "text":
        if (event.text)
          await this.send("Input.insertText", { text: event.text });
        return;
      case "navigate":
        return this.navigate(event.url);
      case "back":
        await this.back();
        return undefined;
    }
  }

  private async mouse(
    event: Extract<BrowserLiveInput, { type: "mouse" }>,
  ): Promise<void> {
    for (const params of mouseSteps(event, this.px(event)))
      await this.send("Input.dispatchMouseEvent", params);
  }

  private async navigate(raw: string): Promise<"url_refused" | undefined> {
    let href: string;
    try {
      href = checkBrowserUrl(raw).href;
    } catch (error) {
      if (error instanceof BrowserToolError) return "url_refused";
      throw error;
    }
    await this.tab.page
      .goto(href, { waitUntil: "commit", timeout: this.budget.timeout() })
      .catch(warnUnlessClosed("live view navigation"));
    return undefined;
  }

  private async back(): Promise<void> {
    const page = this.tab.page;
    const cdp = await this.session();
    const { currentIndex } = await within(
      cdp.send("Page.getNavigationHistory"),
      "history",
      this.stepMs,
    );
    const open = this.tab.context.pages().filter((p) => !p.isClosed());
    if (currentIndex <= 0 && open.length > 1) {
      await page.close();
      return;
    }
    await page
      .goBack({ waitUntil: "commit", timeout: this.budget.timeout() })
      .catch(warnUnlessClosed("live view back"));
  }

  private px(point: { x: number; y: number }): { x: number; y: number } {
    const size = this.tab.page.viewportSize() ?? DESKTOP_VIEWPORT;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return {
      x: Math.round(clamp(point.x) * size.width),
      y: Math.round(clamp(point.y) * size.height),
    };
  }

  private session(): Promise<CDPSession> {
    if (this.closed) throw new InputClosedError("the hand-off has ended");
    const page = this.tab.page;
    if (this.bound?.page !== page) {
      const old = this.bound?.session;
      this.bound = { page, session: this.tab.context.newCDPSession(page) };
      old
        ?.then((session) => session.detach())
        .catch(warnUnlessClosed("input detach"));
    }
    return this.bound.session;
  }

  async close(): Promise<void> {
    this.closed = true;
    const bound = this.bound;
    this.bound = null;
    await bound?.session
      .then((session) => session.detach())
      .catch(warnUnlessClosed("input detach"));
  }
}
