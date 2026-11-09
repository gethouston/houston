import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { useOrgCheckout } from "../../hooks/queries/use-org-checkout";
import { FallbackLink } from "./fallback-link";

/**
 * Why the pay buttons are disabled while a payment page this app opened is
 * still open, and the two ways on: reopen that same page (closing its tab
 * tells the app nothing), or start over, which ends it so the buttons come
 * back. `orgSlug` is the org this surface pays for, or null where none exists
 * yet; another org's page is never offered to reopen here.
 */
export function CheckoutOpenNote({
  checkout,
  orgSlug,
  className,
}: {
  checkout: Pick<ReturnType<typeof useOrgCheckout>, "open" | "startOver">;
  orgSlug: string | null;
  /** Placement only (alignment, spacing). */
  className?: string;
}) {
  const { t } = useTranslation("teams");
  const { open } = checkout;
  if (!open) return null;
  const mine = open.orgSlug === orgSlug;
  const line = !mine
    ? "billing.pending.elsewhere"
    : open.opened
      ? "billing.pending.open"
      : "billing.pending.notOpened";
  return (
    <div
      role="status"
      data-testid="checkout-open-note"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        className,
      )}
    >
      <span className="text-pretty text-ink-muted">{t(line)}</span>
      {mine && (
        <FallbackLink href={open.url} command="billing_checkout_open">
          {t(
            open.opened ? "billing.pending.reopen" : "billing.pending.openPage",
          )}
        </FallbackLink>
      )}
      <button
        type="button"
        className="rounded-full text-link underline outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => checkout.startOver(open.orgSlug)}
      >
        {t("billing.pending.startOver")}
      </button>
    </div>
  );
}
