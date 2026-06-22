import type { QueuedMessageLabels } from "@houston-ai/chat";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function useQueuedMessageLabels(): QueuedMessageLabels {
  const { t } = useTranslation("chat");
  return useMemo(
    () => ({
      title: t("queue.title"),
      remove: t("queue.remove"),
      attachmentsOnly: t("queue.attachmentsOnly"),
    }),
    [t],
  );
}
