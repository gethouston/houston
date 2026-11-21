import { EventEmitter } from "node:events";
import type { Page } from "playwright-core";
import type { BrowserTab } from "../open-tab";

export class FakeCdp extends EventEmitter {
  sent: string[] = [];
  detached = false;
  history = { currentIndex: 1, entries: [{}, {}] };
  private readonly held = new Map<string, Promise<void>>();

  hold(method: string): () => void {
    let release: () => void = () => undefined;
    this.held.set(
      method,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return () => {
      this.held.delete(method);
      release();
    };
  }

  async send(method: string, params?: { text?: string }): Promise<unknown> {
    await this.held.get(method);
    this.sent.push(params?.text ? `${method}:${params.text}` : method);
    if (method === "Page.captureScreenshot") return { data: "STILL" };
    if (method === "Page.getNavigationHistory") return this.history;
    return {};
  }

  async detach(): Promise<void> {
    this.detached = true;
  }

  paint(jpeg: string): void {
    this.emit("Page.screencastFrame", {
      data: jpeg,
      sessionId: 1,
      metadata: { deviceWidth: 1280, deviceHeight: 800 },
    });
  }
}

export interface FakePage {
  closed: boolean;
  wentBack: number;
  address: string;
}

export function fakePage(address = "https://site.test/login") {
  const state: FakePage = { closed: false, wentBack: 0, address };
  const frame = {};
  const page = {
    state,
    isClosed: () => state.closed,
    close: async () => {
      state.closed = true;
    },
    goBack: async () => {
      state.wentBack += 1;
      return null;
    },
    on: () => page,
    off: () => page,
    bringToFront: async () => {},
    title: async () => "Sign in",
    url: () => state.address,
    mainFrame: () => frame,
    viewportSize: () => ({ width: 1280, height: 800 }),
    setViewportSize: async () => {},
  };
  return page;
}

export function fakeTab(
  pages = [fakePage()],
  makeCdp: () => FakeCdp = () => new FakeCdp(),
) {
  const sessions: FakeCdp[] = [];
  const tab = {
    page: pages[0],
    context: {
      newCDPSession: async () => {
        const cdp = makeCdp();
        sessions.push(cdp);
        return cdp;
      },
      pages: () => pages.filter((p) => !p.state.closed),
    },
    generation: 0,
    layout: "desktop",
    onPageChange: new Set<(page: Page) => void>(),
  } as unknown as BrowserTab;
  return { tab, sessions, pages };
}
