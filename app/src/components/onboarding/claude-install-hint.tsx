import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@houston-ai/core";
import type { ClaudeInstallState } from "./use-claude-install";

/**
 * Replacement for the generic "install the CLI yourself" hint when the
 * provider is Anthropic — Houston is supposed to download Claude Code
 * on the user's behalf, so when `cli_installed=false` we explain what
 * Houston tried, why it didn't work, and offer a Retry. See issue #231.
 */
export function ClaudeInstallHint({ state }: { state: ClaudeInstallState }) {
  const { t } = useTranslation("providers");

  if (state.installing) {
    const label =
      state.progressPct === null
        ? t("claudeInstall.installing")
        : t("claudeInstall.installingWithProgress", {
            progress: state.progressPct,
          });
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span>{label}</span>
      </div>
    );
  }

  if (state.errorMessage) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{t("claudeInstall.failedTitle")}</span>
            <span className="text-muted-foreground">{state.errorMessage}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="self-start rounded-full"
          onClick={() => void state.retry()}
        >
          <RefreshCw className="size-3.5" />
          {t("claudeInstall.retry")}
        </Button>
      </div>
    );
  }

  // Neither installing nor failed — install hasn't started yet (e.g.
  // engine still booting) or completed without us seeing the
  // `ClaudeCliReady` event (rare; usually means the user navigated to
  // onboarding *after* a clean boot install and the prop status was
  // stale). Either way, offering a manual kick is the safest fallback.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Download className="mt-0.5 size-3.5 shrink-0" />
        <span>{t("claudeInstall.preparing")}</span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="self-start rounded-full"
        onClick={() => void state.retry()}
      >
        <RefreshCw className="size-3.5" />
        {t("claudeInstall.retry")}
      </Button>
    </div>
  );
}
