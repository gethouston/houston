import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

export function ChannelsHeader({
  spaceName,
  titleRef,
}: {
  spaceName: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useTranslation("settings");
  return (
    <header>
      <h2
        ref={titleRef}
        tabIndex={-1}
        className="mb-1 rounded-sm text-lg font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {t("channels.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("channels.intro")}</p>
      <p className="mt-2 text-sm text-ink-muted">
        {t("channels.space", { name: spaceName })}
      </p>
    </header>
  );
}
