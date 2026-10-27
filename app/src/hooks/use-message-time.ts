import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatLastMessageTime } from "../lib/message-time";

export function useMessageTime() {
  const { t, i18n } = useTranslation("board");
  return useCallback(
    (iso: string) =>
      formatLastMessageTime(iso, i18n.language, {
        now: t("time.now"),
        yesterday: t("time.yesterday"),
      }),
    [t, i18n.language],
  );
}
