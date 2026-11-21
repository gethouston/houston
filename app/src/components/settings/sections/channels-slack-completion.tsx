import { slackCompletionFailure } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import type { SlackCompletion } from "../../../lib/settings-landing";
import { slackCompletionResult } from "../../../lib/slack-completion";

export function SlackCompletionStatus({
  completing,
  landed,
  error,
}: {
  completing: boolean;
  landed: SlackCompletion | null;
  error: unknown;
}) {
  const { t } = useTranslation("settings");
  const failed = slackCompletionResult(landed, slackCompletionFailure(error));
  if (!completing && !failed) return null;
  return (
    <p role="status" className="text-sm text-ink-muted">
      {completing
        ? t("channels.slack.completing")
        : t(
            failed === "taken"
              ? "channels.slack.completeAlready"
              : "channels.slack.completeInvalid",
          )}
    </p>
  );
}
