import {
  AsyncButton,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "../shell/experience-card";

/**
 * The BOOT gate only: Houston is still working out whether this deployment even
 * serves integrations. Once the surface is up, a data refresh shows skeletons
 * that mirror the real sections instead (`integrations-view/catalog-skeletons`).
 *
 * The pulse is the whole animation. It replaced a 5s `transition: width` fill
 * bar, which both animated layout (banned: transform and opacity only) and lied
 * about progress by pretending to know how long the fetch would take. Opacity
 * only, and it stops entirely under `prefers-reduced-motion` — the copy above
 * already says what is happening, so nothing is lost when it does.
 */

/** The three staggered dots, named so their keys are identities rather than the
 *  animation delay they happen to carry (the first delay is the empty string). */
const LOADING_DOTS = [
  { id: "first", delay: "" },
  { id: "second", delay: "[animation-delay:200ms]" },
  { id: "third", delay: "[animation-delay:400ms]" },
] as const;

export function LoadingState() {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <HoustonLogo
        size={48}
        className="mb-2 animate-pulse motion-reduce:animate-none"
      />
      <EmptyHeader>
        <EmptyTitle>{t("loading.title")}</EmptyTitle>
        <EmptyDescription>{t("loading.body")}</EmptyDescription>
      </EmptyHeader>
      <div aria-hidden className="flex gap-1.5">
        {LOADING_DOTS.map((dot) => (
          <span
            key={dot.id}
            className={`size-1.5 animate-pulse rounded-full bg-ink-muted motion-reduce:animate-none ${dot.delay}`}
          />
        ))}
      </div>
    </Empty>
  );
}

/** Desktop, signed out of Houston: one sign-in is the only step. */
export function SigninState({
  onSignIn,
  signingIn,
}: {
  onSignIn: () => void;
  signingIn: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{t("signin.title")}</EmptyTitle>
        <EmptyDescription>{t("signin.body")}</EmptyDescription>
      </EmptyHeader>
      <button
        type="button"
        onClick={onSignIn}
        disabled={signingIn}
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-action px-3 text-xs font-medium text-action-text transition-colors duration-200 hover:bg-action/90 disabled:opacity-60"
      >
        {signingIn && <Loader2 className="size-3 animate-spin" />}
        {t("signin.button")}
      </button>
    </Empty>
  );
}

/** Integrations not configured for this deployment at all. */
export function UnavailableState() {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{t("title")}</EmptyTitle>
        <EmptyDescription>{t("unavailable")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** The one-time "reconnect your apps" security notice, with a dismiss action. */
export function ReconnectBanner({
  onDismiss,
}: {
  onDismiss: () => Promise<void>;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex items-start gap-2 rounded-xl bg-chip p-4 text-sm text-ink-muted">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <span className="flex-1">{t("reconnectNotice")}</span>
      <AsyncButton
        variant="ghost"
        size="sm"
        className="shrink-0 rounded-full"
        onClick={() => onDismiss()}
      >
        {t("reconnectDismiss")}
      </AsyncButton>
    </div>
  );
}
