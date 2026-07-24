import type { ChatPanelProps } from "@houston-ai/chat";
import { Shimmer } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "./shell/experience-card";
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
  const processLabels = useMemo(
    () => ({
      active: t("process.active"),
      activeAction: (action: string) => t("process.activeAction", { action }),
      activeActionPrefix: t("process.activeActionPrefix"),
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

  // HOU-724: two distinct in-flight signals. Before the agent produces any
  // output (the message is still being sent / queued), the indicator is the
  // big blinking Houston helmet alone — no text. The moment the agent is
  // actually working (thinking or running tools) an active mission-log header
  // is on screen reading "Mission in progress: <action>" with the small helmet
  // on its left, and that line is the ONLY indicator — ChatMessages suppresses
  // this standalone one.
  const thinkingIndicator = useMemo(
    () => <HoustonLogo size={20} className="animate-pulse text-ink-muted" />,
    [],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
  };
}
