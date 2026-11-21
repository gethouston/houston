import type {
  LinkedInCompletion,
  LinkedInConnection,
} from "@houston/engine-adapter";
import type { SlackCompletion } from "./settings-landing.ts";

export type LinkedInCompletionResult = "connected" | "unredeemable";

export interface LinkedInCompletionPorts {
  identity: () => string | null;
  complete: (ticket: string) => Promise<LinkedInCompletion>;
  landed: (connection: LinkedInConnection) => void;
  tell: (result: LinkedInCompletionResult) => void;
}

export async function redeemLinkedIn(
  pending: SlackCompletion,
  ports: LinkedInCompletionPorts,
): Promise<void> {
  if (pending.kind === "invalid") return ports.tell("unredeemable");
  const startedAs = ports.identity();
  let result: LinkedInCompletion;
  try {
    result = await ports.complete(pending.ticket);
  } catch {
    return;
  }
  if (startedAs === null || ports.identity() !== startedAs) return;
  if (result.kind === "invalid") return ports.tell("unredeemable");
  ports.landed(result.connection);
  ports.tell("connected");
}

export type LinkedInCompletionStep = "wait" | "hold" | "redeem" | "drop";

export function linkedInCompletionStep(read: {
  linkedinShare: boolean | null;
  isLoading: boolean;
  isError: boolean;
}): LinkedInCompletionStep {
  if (read.linkedinShare !== null)
    return read.linkedinShare ? "redeem" : "drop";
  if (read.isLoading) return "wait";
  return read.isError ? "hold" : "drop";
}

const reportedHolds = new WeakSet<SlackCompletion>();

export function reportHoldOnce(
  queued: SlackCompletion,
  report: () => void,
): void {
  if (reportedHolds.has(queued)) return;
  reportedHolds.add(queued);
  report();
}
