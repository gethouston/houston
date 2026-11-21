import type { Browser } from "playwright-core";

export class LocalBrowser {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly launch: () => Promise<Browser>) {}

  get(): Promise<Browser> {
    if (!this.browser) {
      const launching = this.launch();
      this.browser = launching;
      const forget = () => {
        if (this.browser === launching) this.browser = null;
      };
      launching.then((browser) => browser.on("disconnected", forget), forget);
    }
    return this.browser;
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await (await browser?.catch(() => undefined))?.close();
  }
}
