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
  // The same astronaut deck the pre-reply indicator plays. Passed into
  // processLabels too so the ACTIVE mission-log header keeps the personality
  // through mid-turn reasoning gaps — the standalone indicator below is
  // suppressed the whole time an active log trails (HOU-471/HOU-1047), so
  // without this the header held the last tool's stale verb.
  const loadingPhrases = useMemo(
    () => t("loadingPhrases", { returnObjects: true }) as string[],
    [t],
  );
  const processLabels = useMemo(
    () => ({
      active: t("process.active"),
      complete: t("process.complete"),
      phrases: loadingPhrases,
      resolveActionBrand,
    }),
    [t, loadingPhrases, resolveActionBrand],
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

  // HOU-724 / HOU-910: two distinct in-flight signals. Before the agent
  // produces any output (the message is still being sent / queued), the
  // indicator is the pulsing Houston helmet beside a rotating astronaut
  // one-liner (localized copy passed in; ui/chat handles the shuffle + timer).
  // The moment the agent is actually working an active mission-log header is
  // on screen — the current step's verb, or this same phrase deck during
  // reasoning gaps — and that line is the ONLY indicator: ChatMessages
  // suppresses this one.
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
