import type { ChatPanelProps } from "@houston-ai/chat";
import { Shimmer } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "./shell/experience-card";

export function useChatDisplayLabels(): Pick<
  ChatPanelProps,
  | "processLabels"
  | "getThinkingMessage"
  | "thinkingIndicator"
  | "loadingIndicator"
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

  // HOU-655: while a turn is in flight, the loading state is a single blinking
  // Houston helmet under the "Mission in progress" line. The two pieces are
  // separate props because they live on different clocks: the shimmering label
  // (`thinkingIndicator`) yields to the mission-log header the moment a tool
  // action takes over the status line, while the helmet (`loadingIndicator`)
  // stays up for the WHOLE turn — under either line — and vanishes the instant
  // the reply streams. One helmet, no duplicate label; ChatMessages owns the
  // spacing between them.
  const thinkingIndicator = useMemo(
    () => (
      <Shimmer as="span" duration={1} className="text-xs">
        {t("process.active")}
      </Shimmer>
    ),
    [t],
  );
  const loadingIndicator = useMemo(
    () => (
      <HoustonLogo size={20} className="animate-pulse text-muted-foreground" />
    ),
    [],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    loadingIndicator,
  };
}
