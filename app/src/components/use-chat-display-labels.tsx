import type { ChatPanelProps } from "@houston-ai/chat";
import { ChatStatusLine, Shimmer } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "./shell/experience-card";

export function useChatDisplayLabels(): Pick<
  ChatPanelProps,
  | "processLabels"
  | "getThinkingMessage"
  | "thinkingIndicator"
  | "endOfTurnIndicator"
> {
  const { t } = useTranslation("chat");
  const processLabels = useMemo(
    () => ({
      active: t("process.active"),
      activeAction: (action: string) => t("process.activeAction", { action }),
      complete: t("process.complete"),
    }),
    [t],
  );
  const getThinkingMessage = useCallback<
    NonNullable<ChatPanelProps["getThinkingMessage"]>
  >(
    (isStreaming, duration) => {
      if (isStreaming || duration === 0) {
        return <Shimmer duration={1}>{t("reasoning.thinking")}</Shimmer>;
      }
      if (duration === undefined)
        return <span>{t("reasoning.thoughtForFew")}</span>;
      return <span>{t("reasoning.thoughtFor", { count: duration })}</span>;
    },
    [t],
  );

  // HOU-471: while a turn is in flight, show the calm "Mission in progress..."
  // line, keeping the small helmet to its left (same identity as the
  // mission-log header). The pulsing helmet loader that used to sit here is gone.
  const thinkingIndicator = useMemo(
    () => (
      <div className="py-1 text-muted-foreground/65">
        <ChatStatusLine label={t("process.active")} active />
      </div>
    ),
    [t],
  );

  // HOU-471: once the turn settles, the agent's reply ends with a static
  // (never-blinking) Houston helmet, in the same size and spot the old loader
  // used; only the animation is gone.
  const endOfTurnIndicator = useMemo(
    () => (
      <div className="py-2 flex items-center">
        <HoustonLogo size={20} />
      </div>
    ),
    [],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    endOfTurnIndicator,
  };
}
