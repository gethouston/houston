import { missionAudience } from "@houston/protocol";
import type { UserProfile } from "../hooks/queries/use-user-profiles.ts";
import {
  buildMissionPeople,
  type MissionAttribution,
  missionMatchesMe,
} from "./mission-people.ts";

export interface MissionMention {
  user_id: string;
  at: string;
  by?: string;
}

export interface RelevanceConversation extends MissionAttribution {
  mentioned?: MissionMention[];
}

const NO_PROFILES: ReadonlyMap<string, UserProfile> = new Map();

export function missionIsMine(
  conv: RelevanceConversation,
  selfId: string,
): boolean {
  return missionMatchesMe(buildMissionPeople(conv, NO_PROFILES), selfId);
}

function isPingForMe(mention: MissionMention, selfId: string): boolean {
  return mention.user_id === selfId && mention.by !== selfId;
}

export function missionMentionsMe(
  conv: RelevanceConversation,
  selfId: string,
): boolean {
  return (conv.mentioned ?? []).some((m) => isPingForMe(m, selfId));
}

export function latestMentionFor(
  conv: RelevanceConversation,
  selfId: string,
): { mention: MissionMention; at: number } | null {
  let best: { mention: MissionMention; at: number } | null = null;
  for (const mention of conv.mentioned ?? []) {
    if (!isPingForMe(mention, selfId)) continue;
    const at = Date.parse(mention.at);
    if (Number.isNaN(at)) continue;
    if (!best || at > best.at) best = { mention, at };
  }
  return best;
}

export function latestMentionAtFor(
  conv: RelevanceConversation,
  selfId: string,
): number | null {
  return latestMentionFor(conv, selfId)?.at ?? null;
}

export function isRelevantToMe(
  conv: RelevanceConversation | undefined,
  selfId: string | null,
): boolean {
  if (selfId === null || !conv) return true;
  const audience = missionAudience(conv);
  return "everyone" in audience || audience.user_ids.includes(selfId);
}
