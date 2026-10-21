import { type PlanUpgradeView, planUpgradeView } from "@houston/sdk";
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import {
  type SidebarSurface,
  sidebarRowType,
  sidebarSheetRowClasses,
} from "@houston-ai/layout";
import { CircleAlert, Gauge, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import type { NavMode } from "../../lib/nav-stack";
import { openAdmin } from "../../lib/open-admin";
import { canPurchaseInApp } from "../../lib/purchase-policy";

/** Plain Free draws no glyph beside its words; the icon rail, which has
 *  nothing else to draw, falls back to the usage gauge. */
const GLYPH: Record<PlanUpgradeView["status"], LucideIcon | null> = {
  free: null,
  nearLimit: Gauge,
  limit: CircleAlert,
};

const TONE: Record<PlanUpgradeView["status"], string> = {
  free: "text-ink-muted",
  nearLimit: "text-warning-ink",
  limit: "text-danger-ink",
};

/** The way out drawn as a small filled pill inside the row, so it reads as
 *  an action even to someone who never opened Billing. */
function UpgradeChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-action px-2 py-0.5 font-medium text-action-text text-xs">
      {label}
    </span>
  );
}

/** Who to ask, for someone who does not pay: plain words, not a control. */
function AskOwner({ label }: { label: string }) {
  return <span className="shrink-0 pr-2 text-ink-muted text-xs">{label}</span>;
}

const RAIL_PILL =
  "flex items-center rounded-full bg-sidebar-hover text-ink ht-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** Press feedback, only where the pill is a button. */
const RAIL_PILL_PRESS =
  "transition-[background-color,transform] duration-200 hover:bg-sidebar-active active:scale-[0.96]";

/**
 * A free org's way to a paid plan, on every screen: where its weekly pool
 * stands (`planUpgradeView`: Free, the 80% warning, or the reached limit).
 * For the billing owner it is a button beside an Upgrade chip that opens the
 * org's Billing; for everyone else it is the pool's state and "Ask the owner",
 * from the 80% warning on. A paid or legacy org and deployments without org
 * billing draw nothing.
 *
 * The rail draws a one-line pill between the update notice and the connect
 * rows, the icon rail the glyph alone with the same name as a tooltip. The
 * phone's More card draws it as its own sheet row, navigating with
 * `nav: "reset"`. Opening Admin closes More, a no-op on the desktop.
 *
 * The store apps never sell (`canPurchaseInApp`): there the row is the usage
 * status alone, with no chip and no "Ask the owner", and plain Free (nothing
 * but the offer) draws nothing.
 */
export function PlanUpgradeRow({
  collapsed = false,
  surface = "rail",
  nav,
}: {
  collapsed?: boolean;
  surface?: SidebarSurface;
  nav?: NavMode;
}) {
  const { t } = useTranslation("plan");
  const { billing } = useActiveOrgBilling();
  const view = planUpgradeView(billing);
  const purchasable = canPurchaseInApp();
  const payer = billing?.isBillingOwner === true;
  if (!view || (view.status === "free" && (!purchasable || !payer)))
    return null;

  const status = t(`sidebar.${view.status}`, { percent: view.percent });
  // The store apps never send anyone to upgrade: there the row is the
  // pool's state alone, for the owner and everyone else.
  const name = !purchasable
    ? status
    : payer
      ? t("sidebar.label", { status })
      : t("sidebar.askOwnerLabel", { status });
  const chip = !purchasable ? null : payer ? (
    <UpgradeChip label={t("sidebar.upgrade")} />
  ) : (
    <AskOwner label={t("sidebar.askOwner")} />
  );
  const Icon = GLYPH[view.status];
  const RailIcon = Icon ?? Gauge;
  const tone = TONE[view.status];
  // Only the billing owner can act on the pool; for everyone else the row
  // is the pool's state, read by assistive tech as a status line.
  const Row = payer ? "button" : "div";
  const attrs = {
    ...(payer
      ? {
          type: "button" as const,
          onClick: () => openAdmin({ nav, section: "billing" }),
        }
      : { role: "status" }),
    "aria-label": name,
    "data-testid": "plan-upgrade",
    "data-status": view.status,
  };

  if (surface === "sheet")
    return (
      <Row {...attrs} className={sidebarSheetRowClasses}>
        <span className="flex size-5 shrink-0 items-center justify-center">
          {Icon && <Icon aria-hidden="true" className={cn("size-5", tone)} />}
        </span>
        <span className="min-w-0 flex-1 truncate tabular-nums">{status}</span>
        {chip}
      </Row>
    );

  if (collapsed)
    return (
      <div className="flex justify-center px-2 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Row
              {...attrs}
              tabIndex={payer ? undefined : 0}
              className={cn(
                RAIL_PILL,
                payer && RAIL_PILL_PRESS,
                "size-8 shrink-0 justify-center",
              )}
            >
              <RailIcon aria-hidden="true" className={cn("size-4", tone)} />
            </Row>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {name}
          </TooltipContent>
        </Tooltip>
      </div>
    );

  return (
    <div className="px-2 py-1">
      <Row
        {...attrs}
        className={cn(
          RAIL_PILL,
          payer && RAIL_PILL_PRESS,
          "min-h-8 w-full min-w-0 gap-2 py-1 pr-1 pl-3",
        )}
      >
        {Icon && (
          <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone)} />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left tabular-nums",
            sidebarRowType.item,
          )}
        >
          {status}
        </span>
        {chip}
      </Row>
    </div>
  );
}
