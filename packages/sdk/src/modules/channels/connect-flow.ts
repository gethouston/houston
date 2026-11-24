import type { SlackConnectReturn } from "@houston/wire-types";
import type { SlackConnectAnswer } from "./types";

/** The desktop shell's Slack return listener. */
export interface SlackReturnListener {
  start(state: string): Promise<{ port: number; attemptId: number }>;
  /** A no-op for an attempt that already ended. */
  cancel(attemptId: number): Promise<void>;
}

/** The effects a Slack connect needs, bound by the surface that starts it. */
export interface SlackConnectPorts {
  /** The bound `channels.connectSlack`, with the surface's own guards. */
  connect(
    returnTo: SlackConnectReturn | undefined,
  ): Promise<SlackConnectAnswer>;
  /** Null where nothing can listen on the device (web). */
  listener: SlackReturnListener | null;
  /** A fresh base64url nonce for the loopback `state`. */
  newState(): string;
  /** Throws when the surface moved on (another space, another person) since
   *  the connect began. Checked right before the page opens. */
  assertCurrent(): void;
  /** Opens the page outside the app; false when the browser refused it. */
  open(url: string): Promise<boolean>;
  /** Reports what the person never sees: a failure, or a gateway skew. */
  report(command: string, error: unknown): void;
}

/** The page a connect produced, and whether the browser opened it. */
export interface SlackConnectStarted {
  url: string;
  opened: boolean;
}

/** Raised to the report path when a gateway refused the loopback return. */
export class SlackLoopbackRefusedError extends Error {
  constructor() {
    super("the gateway refused the loopback return; fell back to app");
    this.name = "SlackLoopbackRefusedError";
  }
}

export async function startSlackConnect(
  ports: SlackConnectPorts,
): Promise<SlackConnectStarted> {
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
  try {
    const answer = await ports.connect(attempt.returnTo);
    if (
      attempt.returnTo?.kind === "loopback" &&
      answer.accepted !== "loopback"
    ) {
      ports.report("connect_slack_loopback", new SlackLoopbackRefusedError());
      await free();
    }
    ports.assertCurrent();
    return { url: answer.url, opened: await ports.open(answer.url) };
  } catch (error) {
    await free();
    throw error;
  }
}

interface BoundReturn {
  returnTo: SlackConnectReturn | undefined;
  attemptId: number | null;
}

async function bindReturn(ports: SlackConnectPorts): Promise<BoundReturn> {
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
