import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatLastMessageTime } from "../lib/message-time";
import { usePresentationNow } from "./use-presentation-now";

export function useMessageTime() {
  const { t, i18n } = useTranslation("board");
  const now = usePresentationNow();
  return useCallback(
    (iso: string, dateStyle: "full" | "medium" = "full") =>
      formatLastMessageTime(
        iso,
        i18n.language,
        {
          now: t("time.now"),
          yesterday: t("time.yesterday"),
        },
        new Date(now),
        dateStyle,
      ),
    [t, i18n.language, now],
  );
}
