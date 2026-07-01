import type { ToolRuntimeErrorEntry } from "@houston-ai/chat";
import { Button, Spinner } from "@houston-ai/core";
import {
  ArrowRightLeftIcon,
  BugIcon,
  RotateCcwIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportBug } from "../../lib/bug-report";
import { getCurrentUserEmail } from "../../lib/current-user";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

interface ToolRuntimeErrorCardProps {
  error: ToolRuntimeErrorEntry;
  onRetry?: () => Promise<void> | void;
  /**
   * Invoked when the user clicks "Switch to GPT-5.5" on a
   * `provider_model_unsupported` card. The caller is expected to update
   * whatever scope still pins the unsupported model (workspace, activity,
   * agent override) and then drive a retry.
   */
  onSwitchModel?: () => Promise<void> | void;
}

export function ToolRuntimeErrorCard({
  error,
  onRetry,
  onSwitchModel,
}: ToolRuntimeErrorCardProps) {
  const { t } = useTranslation(["shell", "common"]);
  const addToast = useUIStore((s) => s.addToast);
  const workspaceName = useWorkspaceStore((s) => s.current?.name);
  const [retrying, setRetrying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isModelUnsupported = error.kind === "provider_model_unsupported";

  const retry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      addToast({
        title: t("shell:toolRuntimeError.retryErrorTitle"),
        variant: "error",
      });
    } finally {
      setRetrying(false);
    }
  };

  const report = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      await reportBug({
        command: `tool_runtime_error:${error.kind}`,
        error: error.details || "No diagnostic details captured.",
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
        userEmail: getCurrentUserEmail(),
        workspaceName,
      });
      addToast({
        title: t("shell:toolRuntimeError.reportSuccessTitle"),
        description: t("shell:toolRuntimeError.reportSuccessDescription"),
        variant: "success",
      });
    } catch (e) {
      // Surface the actual failure reason. The bare `catch {}` here used
      // to mask "Bug reporting not configured (missing LINEAR_API_KEY ...)"
      // for months on Windows builds, making the button look broken.
      addToast({
        title: t("shell:toolRuntimeError.reportErrorTitle"),
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    } finally {
      setReporting(false);
    }
  };

  const switchModel = async () => {
    if (!onSwitchModel || switching) return;
    setSwitching(true);
    try {
      await onSwitchModel();
    } catch (e) {
      addToast({
        title: t("shell:toolRuntimeError.modelUnsupported.switchErrorTitle"),
        description:
          e instanceof Error
            ? e.message
            : t(
                "shell:toolRuntimeError.modelUnsupported.switchErrorDescription",
              ),
        variant: "error",
      });
    } finally {
      setSwitching(false);
    }
  };

  const title = isModelUnsupported
    ? t("shell:toolRuntimeError.modelUnsupported.title")
    : t("shell:toolRuntimeError.title");
  const body = isModelUnsupported
    ? t("shell:toolRuntimeError.modelUnsupported.body")
    : t("shell:toolRuntimeError.body");

  return (
    <div className="w-full px-1 py-2">
      <div className="flex items-start gap-4 rounded-2xl bg-secondary p-4 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          <WrenchIcon className="size-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isModelUnsupported && onSwitchModel && (
              <Button
                onClick={switchModel}
                className="h-8 gap-2 rounded-full px-3 text-xs"
                size="sm"
                disabled={switching}
              >
                {switching ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <ArrowRightLeftIcon className="size-3.5" />
                )}
                {switching
                  ? t("shell:toolRuntimeError.modelUnsupported.switching")
                  : t("shell:toolRuntimeError.modelUnsupported.switchAction")}
              </Button>
            )}
            {!isModelUnsupported && onRetry && (
              <Button
                onClick={retry}
                className="h-8 gap-2 rounded-full px-3 text-xs"
                size="sm"
                disabled={retrying}
              >
                {retrying ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <RotateCcwIcon className="size-3.5" />
                )}
                {t("common:actions.tryAgain")}
              </Button>
            )}
            <Button
              onClick={report}
              className="h-8 gap-2 rounded-full px-3 text-xs"
              size="sm"
              variant="outline"
              disabled={reporting}
            >
              {reporting ? (
                <Spinner className="size-3.5" />
              ) : (
                <BugIcon className="size-3.5" />
              )}
              {reporting
                ? t("shell:toolRuntimeError.reporting")
                : t("shell:toolRuntimeError.report")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
