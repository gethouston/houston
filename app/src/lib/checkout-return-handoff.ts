import {
  type CheckoutReturnMessage,
  desktopReturnLink,
  type OrgCheckoutReturn,
  parseCheckoutReturnMessage,
  webReturnPath,
} from "./checkout-return.ts";

/** How long the return page waits for the web tab that opened checkout. */
export const TAKEN_WAIT_MS = 600;
/** How long a refused `window.close()` gets before the tab moves on. */
export const CLOSE_GRACE_MS = 300;

export interface ReturnChannel {
  post(message: CheckoutReturnMessage): void;
  listen(onMessage: (data: unknown) => void): () => void;
}

export interface ReturnPagePorts {
  /** Null where the browser has no BroadcastChannel. */
  channel: ReturnChannel | null;
  close(): void;
  navigate(path: string): void;
  openDeepLink(link: string): void;
  wait(ms: number): Promise<void>;
  /** Say where the person went, before this tab closes or moves. */
  show(where: "web" | "desktop"): void;
}

function askWebTab(
  r: OrgCheckoutReturn,
  channel: ReturnChannel,
  ports: ReturnPagePorts,
) {
  return new Promise<boolean>((resolve) => {
    const stop = channel.listen((data) => {
      const message = parseCheckoutReturnMessage(data);
      if (message?.type !== "taken" || message.org !== r.org) return;
      stop();
      resolve(true);
    });
    channel.post({ type: "returned", ...r });
    void ports.wait(TAKEN_WAIT_MS).then(() => {
      stop();
      resolve(false);
    });
  });
}

/**
 * Hand the person back, once per page load. The web tab that opened checkout
 * takes it and this tab closes (or, where the browser refuses to close it,
 * opens that org's Billing itself). With no such tab the person came from the
 * desktop app, which is tried with ONE deep link: a browser asks before it
 * opens an app, and repeating the attempt only repeats the prompt.
 */
export async function handOffCheckoutReturn(
  r: OrgCheckoutReturn,
  ports: ReturnPagePorts,
): Promise<void> {
  if (ports.channel && (await askWebTab(r, ports.channel, ports))) {
    ports.show("web");
    ports.close();
    await ports.wait(CLOSE_GRACE_MS);
    ports.navigate(webReturnPath(r));
    return;
  }
  ports.show("desktop");
  ports.openDeepLink(desktopReturnLink(r));
}
