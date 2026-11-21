import type { LinkedInConnectAnswer, LinkedInConnectReturn } from "./types";

export interface LinkedInConnectTab {
  navigate(url: string): boolean | Promise<boolean>;
  discard(): void;
}

export interface LinkedInReturnListener {
  start(state: string): Promise<{ port: number; attemptId: number }>;
  cancel(attemptId: number): Promise<void>;
}

export interface LinkedInConnectPorts {
  connect(
    returnTo: LinkedInConnectReturn | undefined,
  ): Promise<LinkedInConnectAnswer>;
  listener: LinkedInReturnListener | null;
  newState(): string;
  tab: LinkedInConnectTab | null;
  open(url: string): Promise<boolean>;
  report(command: string, error: unknown): void;
}

export type LinkedInConnectStarted =
  | { kind: "opened" }
  | { kind: "blocked"; url: string }
  | { kind: "abandoned" };

export class LinkedInLoopbackRefusedError extends Error {
  constructor() {
    super("the gateway refused the loopback return; fell back to app");
    this.name = "LinkedInLoopbackRefusedError";
  }
}

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
