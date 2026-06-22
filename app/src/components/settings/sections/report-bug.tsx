import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@houston-ai/core";
import { reportBug } from "../../../lib/bug-report";
import { getCurrentUserEmail } from "../../../lib/current-user";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";

export function ReportBugSection() {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const canSend = description.trim().length > 0 && !sending;

  const handleSend = async () => {
    const trimmed = description.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const issueId = await reportBug({
        command: "manual_report",
        error: trimmed,
        workspaceName: currentWorkspace?.name,
        userEmail: getCurrentUserEmail(),
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
      });
      setDescription("");
      addToast({
        title: t("reportBug.toasts.successTitle"),
        description: issueId
          ? t("reportBug.toasts.successBodyWithId", { id: issueId })
          : t("reportBug.toasts.successBody"),
        variant: "success",
      });
    } catch (e) {
      addToast({
        title: t("reportBug.toasts.errorTitle"),
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("reportBug.title")}</h2>
      <p className="text-sm text-muted-foreground mb-2">
        {t("reportBug.intro")}
      </p>
      <p className="text-sm text-muted-foreground mb-2">
        {t("reportBug.timingTip")}
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        {t("reportBug.toastEquivalence")}
      </p>
      <div>
        <label
          htmlFor="report-bug-description"
          className="text-xs text-muted-foreground block mb-1.5"
        >
          {t("reportBug.label")}
        </label>
        <textarea
          id="report-bug-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("reportBug.placeholder")}
          rows={5}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-ring transition-all resize-y"
        />
      </div>
      <div className="mt-4">
        <Button
          className="rounded-full"
          disabled={!canSend}
          onClick={handleSend}
        >
          {sending ? t("reportBug.sending") : t("reportBug.send")}
        </Button>
      </div>
    </section>
  );
}
