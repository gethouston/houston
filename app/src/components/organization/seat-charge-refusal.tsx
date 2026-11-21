import { useTranslation } from "react-i18next";
import { FallbackLink } from "../shell/fallback-link";

export function SeatChargeRefusal({
  phase,
  email,
  portalOpened,
  portalFallbackUrl,
}: {
  phase: "declined" | "needs_action";
  email: string;
  portalOpened: boolean;
  portalFallbackUrl: string | null;
}) {
  const { t } = useTranslation("teams");
  const declined = phase === "declined";
  return (
    <div
      role="alert"
      className="rounded-2xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
    >
      <p className="mb-0.5 font-semibold text-danger-ink">
        {t(
          declined
            ? "people.seatCharge.declinedTitle"
            : "people.seatCharge.confirmTitle",
        )}
      </p>
      <p className="break-words">
        {t(
          declined
            ? "people.seatCharge.declinedBody"
            : "people.seatCharge.confirmBody",
          { email },
        )}
      </p>
      {portalOpened && !portalFallbackUrl && (
        <p className="mt-1.5 text-ink-muted">
          {t("people.seatCharge.portalOpened")}
        </p>
      )}
      {portalFallbackUrl && (
        <FallbackLink
          className="mt-1.5 inline-block"
          href={portalFallbackUrl}
          command="billing_portal_open"
        >
          {t("billing.openPortal")}
        </FallbackLink>
      )}
    </div>
  );
}
