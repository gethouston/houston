import type { FeedItem, HostCard } from "@houston-ai/chat";
import { type GoalProgress, goalProgress } from "./goal-progress.ts";
import {
  decodeGoalCard,
  decodeTeamCard,
  type TeamCardPayload,
} from "./onboarding-card-markers.ts";

const ONBOARDING_CARD = "onboarding";

export type OnboardingCard =
  | { kind: "team"; team: TeamCardPayload }
  | { kind: "goal"; goal: string; progress: GoalProgress };

export function onboardingCard(card: HostCard): OnboardingCard | null {
  return card.kind === ONBOARDING_CARD
    ? (card.payload as OnboardingCard)
    : null;
}

function cardItem(id: string | undefined, card: OnboardingCard): FeedItem {
  return {
    feed_type: "host_card",
    ...(id ? { id } : {}),
    data: {
      kind: ONBOARDING_CARD,
      payload: card,
      ...(card.kind === "goal" ? { ownsProgress: true } : {}),
    },
  };
}

export function teamCardItem(key: string, team: TeamCardPayload): FeedItem {
  return cardItem(key, { kind: "team", team });
}

function keptUnderGoalCard(item: FeedItem): boolean {
  return (
    item.feed_type === "final_result" ||
    item.feed_type === "provider_error" ||
    item.feed_type === "system_message"
  );
}

export function withOnboardingCards(items: readonly FeedItem[]): FeedItem[] {
  const lastKickoff = items.findLastIndex(
    (item) =>
      item.feed_type === "user_message" && decodeGoalCard(item.data) !== null,
  );
  const out: FeedItem[] = [];
  let at = 0;
  while (at < items.length) {
    const item = items[at];
    const team =
      item.feed_type === "assistant_text" ? decodeTeamCard(item.data) : null;
    const kickoff =
      item.feed_type === "user_message" ? decodeGoalCard(item.data) : null;
    if (team) out.push(cardItem(item.id, { kind: "team", team }));
    if (!kickoff) {
      if (!team) out.push(item);
      at += 1;
      continue;
    }
    const next = items.findIndex(
      (later, index) => index > at && later.feed_type === "user_message",
    );
    const stop = next < 0 ? items.length : next;
    const turn = items.slice(at + 1, stop);
    if (at === lastKickoff) {
      const seen = next < 0 ? turn : [...turn, items[next]];
      out.push(
        cardItem(item.id, {
          kind: "goal",
          goal: kickoff.goal,
          progress: goalProgress(seen),
        }),
        ...turn.filter(keptUnderGoalCard),
      );
    }
    at = stop;
  }
  return out;
}
