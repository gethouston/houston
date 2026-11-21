import type { SlackConnectReturn } from "@houston/wire-types";
import type { SlackConnectAnswer } from "./types";

export interface SlackReturnListener {
  start(state: string): Promise<{ port: number; attemptId: number }>;
  cancel(attemptId: number): Promise<void>;
}

export interface SlackConnectPorts {
  connect(
    returnTo: SlackConnectReturn | undefined,
  ): Promise<SlackConnectAnswer>;
  listener: SlackReturnListener | null;
  newState(): string;
  assertCurrent(): void;
  open(url: string): Promise<boolean>;
  report(command: string, error: unknown): void;
}

export interface SlackConnectStarted {
  url: string;
  opened: boolean;
}

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
