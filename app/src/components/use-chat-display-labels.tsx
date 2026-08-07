import type { ChatPanelProps } from "@houston-ai/chat";
import { ChatThinkingIndicator, Shimmer } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActionBrandResolver } from "./use-action-brand-resolver";

export function useChatDisplayLabels(): Pick<
  ChatPanelProps,
  "processLabels" | "getThinkingMessage" | "thinkingIndicator"
> {
  const { t } = useTranslation("chat");
  // Resolves an in-flight integration action to the app logo + name + present-
  // tense label the process header shows as a branded row; ui/chat calls it
  // through `processLabels.resolveActionBrand`, staying Composio-unaware.
  const resolveActionBrand = useActionBrandResolver();
  // The astronaut deck plays ONLY in the standalone connecting indicator
  // below (PRODUCT-1226): once the agent is executing, the mission-log header
  // holds the concrete task (sticky verb/brand, with an "x3" repeat counter),
  // never a playful phrase — so a working agent always narrates its work.
  const loadingPhrases = useMemo(
    () => t("loadingPhrases", { returnObjects: true }) as string[],
    [t],
  );
  const processLabels = useMemo(
    () => ({
      active: t("process.active"),
      complete: t("process.complete"),
      resolveActionBrand,
    }),
    [t, resolveActionBrand],
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

  // HOU-724 / HOU-910 / PRODUCT-1226: two distinct in-flight signals. While
  // we're connecting the agent (the message is sent but no output exists yet),
  // the indicator is the mission-log-sized status line playing a rotating
  // astronaut one-liner (localized copy passed in; ui/chat handles the
  // shuffle + timer). The moment the agent is actually working, an active
  // mission-log header is on screen with the current task, and that line is
  // the ONLY indicator: ChatMessages suppresses this one.
  const thinkingIndicator = useMemo(
    () => <ChatThinkingIndicator phrases={loadingPhrases} />,
    [loadingPhrases],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
  };
}
