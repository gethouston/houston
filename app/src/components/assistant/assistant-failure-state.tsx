import {
  AsyncButton,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * What the AI Manager screen says once discovery's retry ladder is spent and
 * Houston still has no address to open the chat at.
 *
 * The same words for a pod that will not wake and for a real failure: the user
 * can act on neither, so the screen states the outcome and hands back the only
 * move there is. No cause, no status code, no stack — an unexpected failure has
 * already reached the log and Sentry, and showing its shape here would trade a
 * blank screen for a frightening one.
 *
 * `AsyncButton` rather than `Button` because the ask is not instant: it runs
 * the whole ladder again, and a plain button would sit there looking ignored
 * for those seconds.
 */
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
