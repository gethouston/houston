import type { ChatPanelProps } from "@houston-ai/chat";
import { ChatThinkingIndicator, Shimmer } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActionBrandResolver } from "./use-action-brand-resolver";

export function useChatDisplayLabels(agentId?: string): Pick<
  ChatPanelProps,
  "processLabels" | "getThinkingMessage" | "thinkingIndicator"
> & {
  busyIndicator: ChatPanelProps["thinkingIndicator"];
} {
  const { t } = useTranslation("chat");
  const resolveActionBrand = useActionBrandResolver(agentId);
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

  const thinkingIndicator = useMemo(
    () => <ChatThinkingIndicator phrases={loadingPhrases} />,
    [loadingPhrases],
  );
  const busyIndicator = useMemo(
    () => <ChatThinkingIndicator phrases={[t("sendWaitingBusy")]} />,
    [t],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
    busyIndicator,
  };
}
