import type { ChatPanelProps } from "@houston-ai/chat";
import { Shimmer } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "./shell/experience-card";

export function useChatDisplayLabels(): Pick<
  ChatPanelProps,
  "processLabels" | "getThinkingMessage" | "thinkingIndicator"
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
  // Houston helmet sitting under the calm, shimmering "Mission in progress..."
  // label. We keep ONE helmet (no small glyph on the label here) so the pulsing
  // mark reads as the loader, not a duplicate icon, and give it real breathing
  // room below the line. It vanishes the instant the turn settles — there is no
  // longer a static helmet at the end of the reply.
  const thinkingIndicator = useMemo(
    () => (
      <div className="flex flex-col items-start gap-4 py-1">
        <Shimmer as="span" duration={1} className="text-xs">
          {t("process.active")}
        </Shimmer>
        <HoustonLogo
          size={20}
          className="animate-pulse text-muted-foreground"
        />
      </div>
    ),
    [t],
  );

  return {
    processLabels,
    getThinkingMessage,
    thinkingIndicator,
  };
}
