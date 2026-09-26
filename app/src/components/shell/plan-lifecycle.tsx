import { planDialog } from "@houston/sdk";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { cronSummary } from "@houston-ai/routines";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useKeepRoutine,
  usePlan,
  usePlanRoutines,
  useResumeRoutines,
} from "../../hooks/queries/use-plan";
import { usePlusCheckoutWatcher } from "../../hooks/queries/use-plus-checkout";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { logAndReportError } from "../../lib/error-report";
import { markPlanPresence, planPresenceDue } from "../../lib/plan-session";
import { tauriOrg } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { PlanAnnouncementDialog } from "./plan-announcement-dialog";
import { createUserDismissal } from "./user-dismissal";

export function PlanLifecycle() {
  const { t } = useTranslation("plan");
  const { capabilities } = useCapabilities();
  const { data: plan } = usePlan();
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [keepDismissed, setKeepDismissed] = useState(false);
  const keepRequested = useUIStore((s) => s.planKeepDialogOpen);
  const setKeepRequested = useUIStore((s) => s.setPlanKeepDialogOpen);
  const dialog = planDialog(
    plan,
    resumeDismissed,
    keepDismissed,
    keepRequested,
  );
  const routines = usePlanRoutines(dialog === "keep" || keepRequested);
  const resume = useResumeRoutines();
  const keep = useKeepRoutine();
  const labels = useRoutineLabels();
  const openSettings = useUIStore((s) => s.openSettings);
  usePlusCheckoutWatcher();
  const [resumeDismissal] = useState(createUserDismissal);
  const [keepDismissal] = useState(createUserDismissal);
  const closeKeep = () => {
    setKeepDismissed(true);
    setKeepRequested(false);
  };

  useEffect(() => {
    if (capabilities?.plan !== true) return;
    const report = () => {
      if (
        document.visibilityState !== "visible" ||
        !planPresenceDue(Date.now())
      )
        return;
      markPlanPresence(Date.now());
      void tauriOrg
        .reportPresence()
        .catch((error: unknown) => logAndReportError("report_presence", error));
    };
    report();
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    return () => {
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
    };
  }, [capabilities?.plan]);

  return (
    <>
      <Dialog
        open={dialog === "resume"}
        onOpenChange={resumeDismissal.onOpenChange(() =>
          setResumeDismissed(true),
        )}
      >
        <DialogContent
          {...resumeDismissal.contentProps}
          className="sm:max-w-md"
          closeLabel={t("notNow")}
        >
          <DialogHeader>
            <DialogTitle>{t("resumeTitle")}</DialogTitle>
            <DialogDescription>{t("resumeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 md:flex-row">
            <Button variant="outline" onClick={() => setResumeDismissed(true)}>
              {t("notNow")}
            </Button>
            <Button disabled={resume.isPending} onClick={() => resume.mutate()}>
              {t("resume")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "keep"}
        onOpenChange={keepDismissal.onOpenChange(closeKeep)}
      >
        <DialogContent
          {...keepDismissal.contentProps}
          className="sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>{t("keepTitle")}</DialogTitle>
            <DialogDescription>{t("keepBody")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
            {routines.isError && (
              <div className="space-y-2">
                <p className="text-sm text-ink-muted">{t("error")}</p>
                <Button variant="outline" onClick={() => routines.refetch()}>
                  {t("retry")}
                </Button>
              </div>
            )}
            {routines.data?.routines.length === 0 && (
              <p className="text-sm text-ink-muted">{t("empty")}</p>
            )}
            {routines.data?.routines.map((routine) => (
              <div
                key={`${routine.orgSlug}:${routine.agentSlug}:${routine.routineId}`}
                className="flex flex-col gap-2 border-b border-line py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {routine.name || routine.routineId}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {routine.agentName} · {routine.orgName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {routine.kind === "trigger"
                      ? t("trigger")
                      : routine.schedule
                        ? cronSummary(
                            routine.schedule,
                            labels.schedule.summary,
                            labels.locale,
                          )
                        : t("schedule")}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={keep.isPending}
                  onClick={() => {
                    setKeepRequested(false);
                    keep.mutate({
                      orgSlug: routine.orgSlug,
                      agentSlug: routine.agentSlug,
                      routineId: routine.routineId,
                    });
                  }}
                >
                  {t("keep")}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                closeKeep();
                openSettings("plan");
              }}
            >
              {t("upgrade")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {plan?.announcement && (
        <PlanAnnouncementDialog plan={plan} open={dialog === "announcement"} />
      )}
    </>
  );
}
