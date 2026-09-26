import { useTranslation } from "react-i18next";
import { FallbackLink } from "./fallback-link";

export function PlanAnnouncementCta({
  label,
  pending,
  fallbackUrl,
  onClick,
}: {
  label: string;
  pending: boolean;
  fallbackUrl: string | null;
  onClick: () => void;
}) {
  const { t } = useTranslation("plan");
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="plan-briefing-cta h-12 w-full rounded-full bg-ink text-base font-medium text-dialog outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
      >
        {label}
      </button>
      {fallbackUrl && (
        <FallbackLink
          className="self-center text-sm"
          href={fallbackUrl}
          command="plus_checkout_open"
        >
          {t("openCheckout")}
        </FallbackLink>
      )}
    </div>
  );
}
