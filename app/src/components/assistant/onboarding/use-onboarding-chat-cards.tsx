import type { AIBoardProps } from "@houston-ai/board";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openStartedMission } from "../../../hooks/started-mission-target";
import { surveyKey } from "../../../hooks/survey-query";
import { useSession } from "../../../hooks/use-session";
import { logAndReportError } from "../../../lib/error-report";
import { normalizeLocale } from "../../../lib/locale";
import { mayRetryGoal } from "../../../lib/manager-onboarding/goal-handoff";
import { goalRetryPrompt } from "../../../lib/manager-onboarding/handoff-prompt";
import { encodeGoalCard } from "../../../lib/manager-onboarding/onboarding-card-markers";
import {
  onboardingCard,
  withOnboardingCards,
} from "../../../lib/manager-onboarding/onboarding-feed";
import type { OnboardingSurveyPreference } from "../../../lib/onboarding-survey-record";
import { openAgentBoard } from "../../../lib/open-agent";
import { OnboardingGoalCard } from "./onboarding-goal-card";
import { OnboardingTeamCard } from "./onboarding-team-card";

type MapFeed = NonNullable<AIBoardProps["mapFeedItems"]>;
type RenderSystem = NonNullable<AIBoardProps["renderSystemMessage"]>;

export function useOnboardingChatCards({
  mapFeedItems,
  renderSystemMessage,
  sendAuthored,
  running,
}: {
  mapFeedItems: AIBoardProps["mapFeedItems"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  sendAuthored: (
    text: string,
    context: string,
    grants: ["createAgent"],
  ) => Promise<void>;
  running: boolean;
}): { mapFeedItems: MapFeed; renderSystemMessage: RenderSystem } {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const retrying = useRef(false);
  const [retryInFlight, setRetryInFlight] = useState(false);

  const mapWithCards = useCallback<MapFeed>(
    (ctx) => {
      const items = withOnboardingCards(ctx.items);
      return mapFeedItems ? mapFeedItems({ ...ctx, items }) : items;
    },
    [mapFeedItems],
  );

  const retry = useCallback(
    (goal: string) => {
      if (retrying.current) return;
      retrying.current = true;
      setRetryInFlight(true);
      const locale = normalizeLocale(i18n.resolvedLanguage) ?? "en";
      sendAuthored(
        encodeGoalCard({ goal }),
        goalRetryPrompt({ goal, locale }),
        ["createAgent"],
      )
        .catch((error: unknown) =>
          logAndReportError("onboarding_goal_retry_send", error),
        )
        .finally(() => {
          retrying.current = false;
          setRetryInFlight(false);
        });
    },
    [i18n, sendAuthored],
  );

  const renderWithCards = useCallback<RenderSystem>(
    (message) => {
      const card = message.hostCard ? onboardingCard(message.hostCard) : null;
      if (card?.kind === "team")
        return (
          <OnboardingTeamCard
            reach={card.team.reach}
            onOpen={(agent) => openAgentBoard(agent.id)}
          />
        );
      if (card?.kind === "goal") {
        const ownGoal = queryClient.getQueryData<OnboardingSurveyPreference>(
          surveyKey(session?.uid ?? null),
        )?.automationGoal;
        const retryable =
          !running && !retryInFlight && mayRetryGoal(card.goal, ownGoal);
        return (
          <OnboardingGoalCard
            goal={card.goal}
            progress={card.progress}
            onOpen={openStartedMission}
            onRetry={retryable ? () => retry(card.goal) : undefined}
          />
        );
      }
      return renderSystemMessage?.(message);
    },
    [renderSystemMessage, running, retryInFlight, retry, queryClient, session],
  );

  return { mapFeedItems: mapWithCards, renderSystemMessage: renderWithCards };
}
