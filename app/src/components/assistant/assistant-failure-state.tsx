import {
  AsyncButton,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function AssistantFailureState({
  onRetry,
}: {
  onRetry: () => Promise<void>;
}) {
  const { t } = useTranslation("assistant");
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{t("failure.title")}</EmptyTitle>
          <EmptyDescription>{t("failure.body")}</EmptyDescription>
        </EmptyHeader>
        <AsyncButton
          className="mt-4 rounded-full"
          size="sm"
          variant="outline"
          onClick={() => onRetry()}
        >
          {t("failure.retry")}
        </AsyncButton>
      </Empty>
    </div>
  );
}
