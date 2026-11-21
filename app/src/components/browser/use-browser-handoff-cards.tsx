import type { AIBoardProps } from "@houston-ai/board";
import { useCallback } from "react";
import {
  browserHandoffCard,
  withBrowserHandoffCards,
} from "../../lib/browser-handoff-feed";
import { BrowserHandoffCardHost } from "./browser-handoff-card-host";

type MapFeed = NonNullable<AIBoardProps["mapFeedItems"]>;
type RenderSystem = NonNullable<AIBoardProps["renderSystemMessage"]>;

export function useBrowserHandoffCards({
  mapFeedItems,
  renderSystemMessage,
  agentPath,
  runningSessionKey,
}: {
  mapFeedItems: MapFeed;
  renderSystemMessage: RenderSystem;
  agentPath: string | undefined;
  runningSessionKey: string | null;
}): { mapFeedItems: MapFeed; renderSystemMessage: RenderSystem } {
  const mapWithCards = useCallback<MapFeed>(
    (ctx) =>
      mapFeedItems({
        ...ctx,
        items: withBrowserHandoffCards(
          ctx.items,
          ctx.sessionKey === runningSessionKey,
          ctx.sessionKey,
        ),
      }),
    [mapFeedItems, runningSessionKey],
  );

  const renderWithCards = useCallback<RenderSystem>(
    (message) => {
      const card = message.hostCard
        ? browserHandoffCard(message.hostCard)
        : null;
      if (card && agentPath)
        return <BrowserHandoffCardHost agentPath={agentPath} card={card} />;
      return renderSystemMessage(message);
    },
    [renderSystemMessage, agentPath],
  );

  return { mapFeedItems: mapWithCards, renderSystemMessage: renderWithCards };
}
