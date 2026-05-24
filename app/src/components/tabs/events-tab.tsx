import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import type { TabProps } from "../../lib/types";

export default function EventsTab(_props: TabProps) {
  const { t } = useTranslation("events");
  return (
    <div className="h-full flex items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{t("comingSoon.title")}</EmptyTitle>
          <EmptyDescription>{t("comingSoon.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
