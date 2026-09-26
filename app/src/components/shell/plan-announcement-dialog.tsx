import { duration, easing, layout, space } from "@houston/design-tokens";
import type { PlanSummary } from "@houston/engine-adapter";
import {
  createPlanAnnouncementActions,
  planAnnouncementView,
} from "@houston/sdk";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@houston-ai/core";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import astroJpg from "../../assets/space/astro-960.jpg";
import astroWebp from "../../assets/space/astro-960.webp";
import { useDismissPlanAnnouncement } from "../../hooks/queries/use-plan";
import { usePlusCheckout } from "../../hooks/queries/use-plus-checkout";
import { useUIStore } from "../../stores/ui";
import { PlanAnnouncementCta } from "./plan-announcement-cta";
import { PlanAnnouncementGift } from "./plan-announcement-gift";
import { PlanAnnouncementPlans } from "./plan-announcement-plans";
import { createUserDismissal } from "./user-dismissal";
import "./plan-announcement.css";

const briefingStyle = {
  "--briefing-width": layout["announcement-dialog-width"],
  "--briefing-space-4": space["4"],
  "--briefing-space-8": space["8"],
  "--briefing-space-16": space["16"],
  "--briefing-space-32": space["32"],
  "--briefing-duration": duration.fast,
  "--briefing-ambient": duration.ambient,
  "--briefing-easing": `cubic-bezier(${easing.entrance.join(", ")})`,
} as CSSProperties;

export function PlanAnnouncementDialog({
  plan,
  open,
}: {
  plan: PlanSummary;
  open: boolean;
}) {
  const { t, i18n } = useTranslation("plan");
  const [dismissed, setDismissed] = useState(false);
  const dismiss = useDismissPlanAnnouncement();
  const checkout = usePlusCheckout();
  const openSettings = useUIStore((s) => s.openSettings);
  const view = planAnnouncementView(plan, i18n.language);

  const [actions] = useState(() =>
    createPlanAnnouncementActions({
      dismiss: () => {
        setDismissed(true);
        dismiss.mutate();
      },
      checkout: () => checkout.start(),
      openPlans: () => openSettings("plan"),
    }),
  );

  const [dismissal] = useState(createUserDismissal);

  return (
    <Dialog
      open={open && !dismissed}
      onOpenChange={dismissal.onOpenChange(actions.close)}
    >
      <DialogContent
        {...dismissal.contentProps}
        data-theme="dark"
        style={briefingStyle}
        showCloseButton={false}
        className="plan-briefing-frame h-dvh overflow-hidden bg-dialog p-0 text-ink motion-reduce:animate-none sm:max-w-[min(var(--briefing-width),calc(100%-var(--briefing-space-32)))] md:h-auto md:max-h-[calc(100dvh-var(--briefing-space-32))]"
      >
        <div className="plan-briefing-stage relative flex min-h-0">
          <picture className="plan-briefing-image pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 md:block">
            <source type="image/webp" srcSet={astroWebp} />
            <img
              src={astroJpg}
              alt=""
              width={960}
              height={1440}
              decoding="async"
              className="plan-briefing-drift h-full w-full object-cover"
            />
          </picture>
          <div
            aria-hidden="true"
            className="plan-briefing-scrim pointer-events-none absolute inset-0 hidden md:block"
          />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:ml-auto md:w-2/3 md:flex-none px-5 pb-[calc(env(safe-area-inset-bottom)+var(--briefing-space-32))] pt-[calc(env(safe-area-inset-top)+var(--briefing-space-32))] md:px-8 md:pb-8 md:pt-8">
            <div className="plan-briefing-rise plan-briefing-stage-2 space-y-4 pb-8 pt-4 md:pb-10 md:pt-6">
              <DialogTitle className="pr-8 text-balance text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                {view.starts
                  ? t("announcementBetaTitle", { date: view.starts })
                  : t("announcementBetaTitleNow")}
              </DialogTitle>
              <DialogDescription className="max-w-prose text-base leading-relaxed text-ink-muted">
                {t("announcementThanks")}
              </DialogDescription>
            </div>
            <PlanAnnouncementPlans view={view} />
            {view.offer ? (
              <PlanAnnouncementGift
                offer={view.offer}
                price={view.plus.current}
              >
                <PlanAnnouncementCta
                  label={t("announcementCta", { amount: view.offer.amount })}
                  pending={checkout.outstanding}
                  fallbackUrl={checkout.fallbackUrl}
                  onClick={() => actions.primary(view.action)}
                />
              </PlanAnnouncementGift>
            ) : (
              <div className="plan-briefing-rise plan-briefing-stage-4 mt-6">
                <PlanAnnouncementCta
                  label={t("seePlans")}
                  pending={false}
                  fallbackUrl={null}
                  onClick={() => actions.primary(view.action)}
                />
              </div>
            )}
            <button
              type="button"
              onClick={actions.close}
              className="plan-briefing-rise plan-briefing-stage-6 mt-4 self-center rounded-full px-4 py-2 text-sm text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
            >
              {t("maybeLater")}
            </button>
          </div>
        </div>
        <DialogCloseButton
          label={t("maybeLater")}
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+var(--briefing-space-16))] md:top-4"
        />
      </DialogContent>
    </Dialog>
  );
}
