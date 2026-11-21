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

function UpgradeChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-action px-2 py-0.5 font-medium text-action-text text-xs">
      {label}
    </span>
  );
}

function AskOwner({ label }: { label: string }) {
  return <span className="shrink-0 pr-2 text-ink-muted text-xs">{label}</span>;
}

const RAIL_PILL =
  "flex items-center rounded-full bg-sidebar-hover text-ink ht-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const RAIL_PILL_PRESS =
  "transition-[background-color,transform] duration-200 hover:bg-sidebar-active active:scale-[0.96]";

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
