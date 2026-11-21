import {
  type CheckoutReturnMessage,
  desktopReturnLink,
  type OrgCheckoutReturn,
  parseCheckoutReturnMessage,
  webReturnPath,
} from "./checkout-return.ts";

export const TAKEN_WAIT_MS = 600;
export const CLOSE_GRACE_MS = 300;

export interface ReturnChannel {
  post(message: CheckoutReturnMessage): void;
  listen(onMessage: (data: unknown) => void): () => void;
}

export interface ReturnPagePorts {
  channel: ReturnChannel | null;
  close(): void;
  navigate(path: string): void;
  openDeepLink(link: string): void;
  wait(ms: number): Promise<void>;
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
