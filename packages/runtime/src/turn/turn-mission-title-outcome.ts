import {
  addressesMission,
  normalizeActivities,
  parseJsonDoc,
} from "@houston/domain";
import type { Activity } from "@houston/protocol";
import type { MissionTitleMiss } from "../session/mission-title";
import type { TurnSyncReport } from "./turn-sync-report";

export type MissionTitleOutcome =
  | "written"
  | "renamed"
  | "card_missing"
  | "write_failed"
  | "skipped"
  | "sync_lost"
  | "unverified"
  | MissionTitleMiss;

export interface MissionTitleReport {
  outcome: MissionTitleOutcome;
  ms: number;
  waitMs?: number;
  mergeAttempts?: number;
}

export interface MissionTitleWrite {
  conversationId: string;
  title: string;
  fallback: string;
}

export interface InTreeMissionTitle extends MissionTitleReport {
  written?: MissionTitleWrite;
}

export function landedMissionTitle(
  inTree: InTreeMissionTitle | undefined,
  sync: TurnSyncReport | undefined,
): MissionTitleReport {
  const { written, ...report } = inTree ?? { outcome: "skipped", ms: 0 };
  if (report.outcome !== "written") return report;
  const board = sync?.board ?? { landed: false };
  return {
    ...report,
    outcome: board.landed ? landedOutcome(written, board.body) : "sync_lost",
    ...(board.mergeAttempts ? { mergeAttempts: board.mergeAttempts } : {}),
  };
}

function landedOutcome(
  written: MissionTitleWrite | undefined,
  body: string | undefined,
): MissionTitleOutcome {
  if (!written || body === undefined) return "unverified";
  const cards = landedCards(body);
  if (!cards) return "unverified";
  const card = cards.find((a) => addressesMission(a, written.conversationId));
  if (!card) return "card_missing";
  if (card.title === written.title) return "written";
  return card.title === written.fallback ? "sync_lost" : "renamed";
}

const BOARD = "activity.json";

function landedCards(body: string): Activity[] | undefined {
  try {
    return normalizeActivities(parseJsonDoc(body, BOARD), BOARD).items;
  } catch (err) {
    console.error(
      "[mission-title] landed board unreadable; the title is unverified:",
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}
