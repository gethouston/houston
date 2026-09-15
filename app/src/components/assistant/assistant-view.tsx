import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useAssistant } from "../../hooks/use-assistant";
import { AssistantChat } from "./assistant-chat";
import { AssistantFailureState } from "./assistant-failure-state";

/**
 * The assistant screen: discovery, then the chat.
 *
 * Discovery is the one thing the app cannot work out for itself (which agent
 * holds the assistant, which conversation to open), so the screen waits on it
 * behind a calm spinner and hands the address to the chat. It resolves once per
 * session — the query is cached forever — so this beat is only ever the first
 * open. The spinner also covers a query that is PAUSED rather than in flight
 * (an offline device), because `isLoading` means "no answer yet", not "a
 * request is on the wire".
 *
 * The wait is bounded. Once the retry ladder is spent with no address, the
 * screen says so and offers another ask rather than spinning forever — a
 * manager that will not start must stay somewhere the user can act on it.
 *
 * A deployment that serves no assistant renders nothing here at all: the rail
 * row is already hidden and the view guard sends a stale `viewMode` home, so
 * this branch is only reached in the beat between the two. Nothing is said to
 * the user; that deployment simply has no manager.
 */
export function AssistantView() {
  const { t } = useTranslation("assistant");
  const { handle, isLoading, failure, retry } = useAssistant();

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-ink-muted">
        <Spinner className="size-5" aria-label={t("opening")} />
        <p className="text-sm">{t("opening")}</p>
      </div>
    );
  }
  if (failure) return <AssistantFailureState onRetry={retry} />;
  if (!handle) return null;
  return <AssistantChat handle={handle} />;
}
