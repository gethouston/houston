import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "./use-connect-flow";

/**
 * The inline panel shown while a connect flow is mid-OAuth for a toolkit: a
 * spinner, an explanation that the app opened in the browser, and the three
 * recovery actions — Reopen the page, "I have finished" (wake the poll now), or
 * Cancel. Shared by the catalog picker and the pending-connection callout so
 * the browser hand-off reads identically everywhere.
 */
export function ConnectWaitingPanel({
  appName,
  connectFlow,
}: {
  appName: string;
  connectFlow: ConnectFlow;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="rounded-xl border border-line bg-input p-3">
      <div className="flex items-start gap-2.5">
        <Spinner className="mt-0.5 size-4 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">
            {t("waiting.title", { app: appName })}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {t("waiting.body")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => connectFlow.checkNow()}
          className="inline-flex h-7 items-center rounded-full bg-action px-3 text-xs font-medium text-action-text transition-colors hover:bg-action/90"
        >
          {t("waiting.check")}
        </button>
        <button
          type="button"
          onClick={() => void connectFlow.reopen()}
          className="inline-flex h-7 items-center rounded-full border border-line bg-input px-3 text-xs font-medium text-ink transition-colors hover:bg-chip"
        >
          {t("waiting.reopen")}
        </button>
        <button
          type="button"
          onClick={() => connectFlow.cancel()}
          className="inline-flex h-7 items-center rounded-full px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-chip"
        >
          {t("waiting.cancel")}
        </button>
      </div>
    </div>
  );
}
