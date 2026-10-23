import { planDialog, planDialogBlocks } from "@houston/sdk";
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { useOrgCheckoutWatcher } from "../../hooks/queries/use-org-checkout";
import {
  useKeepRoutine,
  usePlanRoutines,
  useResumeRoutines,
} from "../../hooks/queries/use-plan";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePlanPresence } from "../../hooks/use-plan-presence";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { openAdmin } from "../../lib/open-admin";
import { useUIStore } from "../../stores/ui";
import { BillingChangeModal } from "./billing-change-modal";
import { PlanKeepFooter } from "./plan-keep-footer";
import { PromoEndedModal } from "./promo-ended-modal";
import { useOrgDismissal } from "./use-org-dismissal";
import { createUserDismissal } from "./user-dismissal";

export function PlanLifecycle() {
  const { t } = useTranslation("plan");
  const { capabilities } = useCapabilities();
  const org = useActiveOrgBilling();
  const [resumeDismissed, setResumeDismissed] = useOrgDismissal(org.orgSlug);
  const [keepDismissed, dismissKeep] = useOrgDismissal(org.orgSlug);
  const keepRequested = useUIStore((s) => s.planKeepDialogOpen);
  const setKeepRequested = useUIStore((s) => s.setPlanKeepDialogOpen);
  const dialog = planDialog(org.billing, {
    resumeDismissed,
    keepDismissed,
    keepRequested,
    announcement: false,
  });
  const routines = usePlanRoutines(dialog === "keep" || keepRequested);
  const resume = useResumeRoutines();
  const keep = useKeepRoutine();
  const labels = useRoutineLabels();
  useOrgCheckoutWatcher();
  const [resumeDismissal] = useState(createUserDismissal);
  const [keepDismissal] = useState(createUserDismissal);
  const closeKeep = () => {
    dismissKeep();
    setKeepRequested(false);
  };

  usePlanPresence(capabilities?.plan === true, org.orgSlug);
  const [choiceShown, setChoiceShown] = useState(false);
  const planBlocked = planDialogBlocks(dialog, {
    planLoading: org.isLoading,
    announcementClosed: true,
  });

  return (
    <>
      <Dialog
        open={dialog === "resume"}
        onOpenChange={resumeDismissal.onOpenChange(() => setResumeDismissed())}
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
            <Button variant="outline" onClick={() => setResumeDismissed()}>
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
          <PlanKeepFooter
            offer={org.billing?.isBillingOwner === true}
            onClose={closeKeep}
            onUpgrade={() => {
              closeKeep();
              openAdmin({ section: "billing" });
            }}
          />
        </DialogContent>
      </Dialog>
      <BillingChangeModal
        otherDialogOpen={planBlocked}
        onShownChange={setChoiceShown}
      />
      {/* One modal at a time: the promo-ended notice waits for the
          pricing-change modal (the pick or its confirm) and every plan
          dialog. */}
      <PromoEndedModal otherDialogOpen={planBlocked || choiceShown} />
    </>
  );
}
