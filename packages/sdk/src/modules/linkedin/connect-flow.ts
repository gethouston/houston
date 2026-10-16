/**
 * The whole of a LinkedIn connect a surface starts: which return to ask the
 * gateway for, the desktop listener that return needs, minting LinkedIn's
 * page, and opening it where the person will see it. The Slack connect's
 * sequence (`../channels/connect-flow.ts`), for LinkedIn.
 *
 * Web names no return: the page loads in a tab the click claimed (a browser
 * only grants one inside the click, and the page is known only after the
 * mint), and LinkedIn sends that tab back to the web app with a ticket. The
 * desktop binds a loopback listener first and names its port and a fresh
 * `state`, so the approving browser comes back over plain `127.0.0.1` with no
 * prompt; a listener that cannot start, or a gateway that refuses it, falls
 * back to the `app` deep link. Either way the signed-in app redeems the
 * ticket (`linkedin.complete`): a connect is never completed by polling.
 *
 * A listener no browser can reach any more is freed: the gateway took another
 * return, the mint failed, or the person closed the claimed tab. One the
 * browser merely refused to open stays up, since the surface offers the page
 * again behind a click.
 */

import type { LinkedInConnectAnswer, LinkedInConnectReturn } from "./types";

/** A tab claimed in the click (`reserveBrowserTab`), not yet pointed anywhere. */
export interface LinkedInConnectTab {
  /** `false` when the person already closed the empty tab. */
  navigate(url: string): boolean | Promise<boolean>;
  /** Close the tab if it never got a page. */
  discard(): void;
}

/** The desktop shell's return listener. */
export interface LinkedInReturnListener {
  start(state: string): Promise<{ port: number; attemptId: number }>;
  /** A no-op for an attempt that already ended. */
  cancel(attemptId: number): Promise<void>;
}

/** The effects a LinkedIn connect needs, bound by the surface. */
export interface LinkedInConnectPorts {
  /** The bound `linkedin.connect`. */
  connect(
    returnTo: LinkedInConnectReturn | undefined,
  ): Promise<LinkedInConnectAnswer>;
  /** Null where nothing can listen on the device (web). */
  listener: LinkedInReturnListener | null;
  /** A fresh base64url nonce for the loopback `state`. */
  newState(): string;
  /** The tab the click claimed, or null where none was (or could be). */
  tab: LinkedInConnectTab | null;
  /** Opens the page outside the app; `false` when it was refused. */
  open(url: string): Promise<boolean>;
  /** Reports what the person never sees. */
  report(command: string, error: unknown): void;
}

/**
 * How the connect landed:
 *  - `opened`: LinkedIn's page is in front of the person.
 *  - `blocked`: the browser refused to open it; the surface offers `url`
 *    behind a click, which a popup blocker honors.
 *  - `abandoned`: the person closed the tab the click claimed before the page
 *    came: they left, so nothing else opens.
 */
export type LinkedInConnectStarted =
  | { kind: "opened" }
  | { kind: "blocked"; url: string }
  | { kind: "abandoned" };

/** Raised to the report path when a gateway refused the loopback return. */
export class LinkedInLoopbackRefusedError extends Error {
  constructor() {
    super("the gateway refused the loopback return; fell back to app");
    this.name = "LinkedInLoopbackRefusedError";
  }
}

/** A failed mint frees the listener, discards the tab and rejects with it. */
export async function startLinkedInConnect(
  ports: LinkedInConnectPorts,
): Promise<LinkedInConnectStarted> {
  const { tab } = ports;
  const attempt = await bindReturn(ports);
  const free = async () => {
    if (attempt.attemptId === null || ports.listener === null) return;
    const { attemptId } = attempt;
    attempt.attemptId = null;
    try {
      await ports.listener.cancel(attemptId);
    } catch (error) {
      ports.report("cancel_channels_loopback", error);
    }
  };
  let answer: LinkedInConnectAnswer;
  try {
    answer = await ports.connect(attempt.returnTo);
  } catch (error) {
    tab?.discard();
    await free();
    throw error;
  }
  if (attempt.returnTo?.kind === "loopback" && answer.accepted !== "loopback") {
    ports.report(
      "connect_linkedin_loopback",
      new LinkedInLoopbackRefusedError(),
    );
    await free();
  }
  if (tab) {
    if (await tab.navigate(answer.url)) return { kind: "opened" };
    await free();
    return { kind: "abandoned" };
  }
  return (await ports.open(answer.url))
    ? { kind: "opened" }
    : { kind: "blocked", url: answer.url };
}

interface BoundReturn {
  returnTo: LinkedInConnectReturn | undefined;
  attemptId: number | null;
}

async function bindReturn(ports: LinkedInConnectPorts): Promise<BoundReturn> {
  if (ports.listener === null) return { returnTo: undefined, attemptId: null };
  const state = ports.newState();
  try {
    const { port, attemptId } = await ports.listener.start(state);
    return { returnTo: { kind: "loopback", port, state }, attemptId };
  } catch (error) {
    ports.report("start_channels_loopback", error);
    return { returnTo: { kind: "app" }, attemptId: null };
  }
}
