import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useAssistant } from "../../hooks/use-assistant";
import { AssistantChat } from "./assistant-chat";

/**
 * The assistant screen: discovery, then the chat.
 *
 * Discovery is the one thing the app cannot work out for itself (which agent
 * holds the assistant, which conversation to open), so the screen waits on it
 * behind a calm spinner and hands the address to the chat. It resolves once per
 * session — the query is cached forever — so this beat is only ever the first
 * open. The spinner also covers a query that is PAUSED rather than in flight
 * (an offline device) and one being refetched after a failure, because
 * `isLoading` means "no answer yet", not "a request is on the wire".
 *
 * A deployment that serves no assistant renders nothing here at all: the rail
 * row is already hidden and the view guard sends a stale `viewMode` home, so
 * this branch is only reached in the beat between the two. Nothing is said to
 * the user; the failure was already reported when discovery answered.
 */
export function AssistantView() {
  const { t } = useTranslation("assistant");
  const { handle, isLoading } = useAssistant();

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-ink-muted">
        <Spinner className="size-5" aria-label={t("opening")} />
        <p className="text-sm">{t("opening")}</p>
      </div>
    );
  }
  if (!handle) return null;
  return <AssistantChat handle={handle} />;
}
