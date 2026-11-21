import type { IntegrationConnection } from "@houston/engine-adapter";
import type { FlowEntry } from "./connect-flow-registry.ts";
import {
  POLL_INTERVAL_MS,
  type PollOutcome,
  pollConnectionUntilActive,
} from "./model.ts";

export type ConnectStep = "starting" | "waiting" | "blocked";

export type ConnectNotice = "connected" | "failed" | "stopped" | "cancelled";

export const CONNECT_SUCCESS_DWELL_MS = 900;

export interface ConnectRunDeps {
  entry: FlowEntry;
  mintLink: (
    toolkit: string,
  ) => Promise<{ redirectUrl: string; connectionId: string }>;
  openUrl: (url: string) => Promise<boolean>;
  readConnection: (connectionId: string) => Promise<IntegrationConnection>;
  setStep: (toolkit: string, step: ConnectStep | null) => void;
  setNotice: (toolkit: string, notice: ConnectNotice | null) => void;
  invalidate: () => Promise<void>;
  focus: () => Promise<void>;
  announce: (toolkit: string, outcome: PollOutcome) => void;
  release: (toolkit: string) => void;
  report: (command: string, err: unknown) => void;
  wait: (ms: number) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

export async function runConnectFlow(
  toolkit: string,
  deps: ConnectRunDeps,
): Promise<PollOutcome | null> {
  const { entry } = deps;
  deps.setNotice(toolkit, null);
  deps.setStep(toolkit, "starting");
  try {
    let outcome: PollOutcome;
    try {
      const { redirectUrl, connectionId } = await deps.mintLink(toolkit);
      entry.redirectUrl = redirectUrl;
      entry.connectionId = connectionId;
      if (entry.cancelled) {
        outcome = "cancelled";
      } else {
        const opened = await deps.openUrl(redirectUrl);
        deps.setStep(toolkit, opened ? "waiting" : "blocked");
        outcome = await pollConnectionUntilActive({
          poll: () => deps.readConnection(connectionId),
          sleep: deps.wait,
          isCancelled: () => entry.cancelled,
          intervalMs: POLL_INTERVAL_MS,
        });
      }
    } catch {
      deps.setNotice(toolkit, "failed");
      return null;
    }
    await settle(toolkit, outcome, deps);
    return outcome;
  } finally {
    deps.release(toolkit);
    deps.setStep(toolkit, null);
  }
}

async function settle(
  toolkit: string,
  outcome: PollOutcome,
  deps: ConnectRunDeps,
): Promise<void> {
  const settled = outcome !== "cancelled";
  if (settled) deps.setNotice(toolkit, noticeFor(outcome));
  deps.setStep(toolkit, null);
  if (outcome === "active") {
    void deps
      .focus()
      .catch((err) => deps.report("integrations.connectFlow.focus", err));
  }
  try {
    if (settled) deps.announce(toolkit, outcome);
    if (outcome === "active") await deps.sleep(CONNECT_SUCCESS_DWELL_MS);
    await deps.invalidate();
  } catch (err) {
    deps.report("integrations.connectFlow.settle", err);
  }
}

export function noticeFor(
  outcome: Exclude<PollOutcome, "cancelled">,
): ConnectNotice {
  if (outcome === "active") return "connected";
  if (outcome === "timeout") return "stopped";
  if (outcome === "gone") return "cancelled";
  return "failed";
}
