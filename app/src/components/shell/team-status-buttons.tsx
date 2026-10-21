import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  TeamStatusAction,
  TeamStatusView,
} from "../../lib/team-status-model";

type Shown = Exclude<TeamStatusView, { kind: "none" }>;

type LabelKey =
  | "unlock"
  | "upgrade"
  | "manageBilling"
  | "fixPayment"
  | "changePick"
  | "claimFree"
  | "delete";

/** The label key for a button: paying reads by state, the rest are fixed. */
function labelKey(action: TeamStatusAction, view: Shown): LabelKey {
  switch (action) {
    case "checkout":
      return view.kind === "locked" ? "unlock" : "upgrade";
    case "portal":
      return view.kind === "scheduled" ? "manageBilling" : "fixPayment";
    case "change_pick":
      return "changePick";
    case "claim_free":
      return "claimFree";
    case "delete":
      return "delete";
  }
}

const isPay = (action: TeamStatusAction) =>
  action === "checkout" || action === "portal";

/**
 * At most two buttons, the first filled, and the rest behind an always
 * visible More. Paying is disabled while a payment is in flight.
 */
export function TeamStatusButtons({
  view,
  onAction,
  paying,
}: {
  view: Shown;
  onAction: (action: TeamStatusAction) => void;
  paying: boolean;
}) {
  const { t } = useTranslation("teams");
  const disabled = (action: TeamStatusAction) =>
    isPay(action) && (view.waiting || paying);
  if (view.buttons.length === 0 && view.more.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pl-6 md:shrink-0 md:flex-nowrap md:pl-0">
      {view.buttons.map((action, index) => (
        <Button
          key={action}
          size="sm"
          variant={index === 0 ? "default" : "outline"}
          className="rounded-full active:scale-[0.97] motion-reduce:active:scale-100"
          disabled={disabled(action)}
          onClick={() => onAction(action)}
        >
          {t(`status.actions.${labelKey(action, view)}`)}
        </Button>
      ))}
      {view.more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="rounded-full">
              <MoreHorizontal aria-hidden className="size-4" />
              {t("status.actions.more")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {view.more.map((action) => (
              <DropdownMenuItem
                key={action}
                disabled={disabled(action)}
                onSelect={() => onAction(action)}
              >
                {t(`status.actions.${labelKey(action, view)}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
