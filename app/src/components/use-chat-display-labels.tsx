import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Shimmer } from "@houston-ai/chat";
import type { ChatMessage, ChatPanelProps } from "@houston-ai/chat";
import { HoustonLogo } from "./shell/experience-card";

export function useChatDisplayLabels(): Pick<
  ChatPanelProps,
  | "processLabels"
  | "getThinkingMessage"
  | "thinkingIndicator"
  | "renderMessageAvatar"
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
      if (duration === undefined) return <span>{t("reasoning.thoughtForFew")}</span>;
      return <span>{t("reasoning.thoughtFor", { count: duration })}</span>;
    },
    [t],
  );

  // HOU-471: while a turn is in flight, show only the calm "Mission in
  // progress..." line. The pulsing helmet that used to load here is gone; the
  // helmet now appears static at the END of the agent's reply (below).
  const thinkingIndicator = useMemo(
    () => (
      <div className="py-1">
        <Shimmer duration={2}>{t("process.active")}</Shimmer>
      </div>
    ),
    [t],
  );

  // HOU-471: a static (never-blinking) Houston helmet tucked at the end of each
  // agent reply, so the helmet reads as a signature rather than a loader.
  const renderMessageAvatar = useCallback(
    (msg: ChatMessage) =>
      msg.from === "assistant" ? (
        <HoustonLogo size={16} className="text-muted-foreground/70" />
      ) : undefined,
    [],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    renderMessageAvatar,
  };
}
