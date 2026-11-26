import type { FirstResponseOutcome } from "@houston/sdk";
import type { BoardLoadTags } from "./perf-span-board";

/** The spans `perf-spans.ts` measures, and what they hand their transport. */
export type PerfSpanName =
  | "app_to_board"
  | "card_click_to_chat"
  | "send_to_first_response"
  | "send_to_first_activity";

export interface PerfSpanObservation {
  span: PerfSpanName;
  ms: number;
}

/** What a mirrored span carries beyond its duration. */
export interface PerfSpanTags {
  /** The hosted org a send ran in; null on spans no send pairs and off the gateway. */
  orgSlug: string | null;
  /** How the turn behind a send span ended up; absent on the other spans. */
  outcome?: FirstResponseOutcome;
  /** Why an `app_to_board` span may not be a load time; absent on the other spans. */
  board?: BoardLoadTags;
}

export interface PerfSpanTransport {
  /**
   * POST a batch to the gateway; absent session → don't call configure yet.
   * Omitted entirely when the build bakes no ingest URL (there is no default
   * host to fall back to): spans are still measured and mirrored, just never
   * shipped, and the queue is dropped instead of growing forever.
   */
  send?(spans: PerfSpanObservation[]): Promise<void>;
  /** Per-span mirror (PostHog). Fire-and-forget. */
  mirror?(span: PerfSpanName, ms: number, tags: PerfSpanTags): void;
}
