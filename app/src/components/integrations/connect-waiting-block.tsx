import { AsyncButton, Button, Spinner } from "@houston-ai/core";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConnectFlowVariant } from "./connect-flow-inline";
import type { ConnectFlow } from "./connect-flow-registry";

/**
 * The live poll's compact expansion: the browser hand-off explained, plus the
 * ways back. As a `panel` it wears a quiet input-surface box for the surfaces
 * that host it alone; as `bare` it is already inside the catalog row's own
 * card and brings no frame and no spinner of its own.
 *
 * Two readings of the same poll:
 *  - waiting — the provider page IS open: "finish there", then check now /
 *    reopen the same page / cancel;
 *  - blocked — the browser refused to open the page (a popup blocker, web).
 *    Saying "we opened {app}" here would be the lie the user catches when no
 *    tab appeared, so the copy names the block and the PRIMARY action opens
 *    the page from a click the blocker honors. Once it opens, the flow flips
 *    to waiting.
 */
export function WaitingBlock({
  appName,
  toolkit,
  connectFlow,
  variant,
  blocked,
}: {
  appName: string;
  toolkit: string;
  connectFlow: ConnectFlow;
  variant: ConnectFlowVariant;
  blocked: boolean;
}) {
  const { t } = useTranslation("integrations");
  const copy = (
    <>
      <p className="font-medium text-ink">
        {t(blocked ? "waiting.blockedTitle" : "waiting.title", {
          app: appName,
        })}
      </p>
      {/* The body names the app too: it was shipping the raw "{{app}}"
          placeholder, because the old panel never passed the value in. */}
      <p className="mt-0.5 text-ink-muted text-xs">
        {t(blocked ? "waiting.blockedBody" : "waiting.body", { app: appName })}
      </p>
    </>
  );
  return (
    <div
      className={
        variant === "panel"
          ? "rounded-xl border border-line bg-input p-3"
          : undefined
      }
    >
      {variant === "panel" ? (
        <div className="flex items-start gap-2.5">
          {blocked ? (
            <TriangleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-ink-muted"
            />
          ) : (
            <Spinner className="mt-0.5 size-4 text-ink-muted" />
          )}
          <div className="min-w-0 flex-1">{copy}</div>
        </div>
      ) : (
        copy
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {blocked ? (
          <AsyncButton
            size="xs"
            spinner={false}
            onClick={() => connectFlow.reopen(toolkit)}
          >
            {t("waiting.open", { app: appName })}
          </AsyncButton>
        ) : (
          <>
            {/* Waking the poll is synchronous — nothing to await, so nothing
                for an AsyncButton's in-flight guard to hold. */}
            <Button
              size="xs"
              type="button"
              onClick={() => connectFlow.checkNow(toolkit)}
            >
              {t("waiting.check")}
            </Button>
            <AsyncButton
              size="xs"
              variant="outline"
              spinner={false}
              onClick={() => connectFlow.reopen(toolkit)}
            >
              {t("waiting.reopen")}
            </AsyncButton>
          </>
        )}
        <Button
          size="xs"
          variant="ghost"
          type="button"
          onClick={() => connectFlow.cancel(toolkit)}
        >
          {t("waiting.cancel")}
        </Button>
      </div>
    </div>
  );
}
