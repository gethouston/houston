import type { ChoiceDoneOrg, ChoiceOrgStatus } from "@houston/sdk";
import { formatCutoverDay } from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useOrgName } from "./free-org-picker-rows";
import { OrgAvatar } from "./org-avatar";

const QUIET = "text-ink-muted outline outline-1 -outline-offset-1 outline-line";

const STATUS = {
  free: {
    label: "choice.done.status.free",
    className: "bg-success/12 text-success-ink",
  },
  subscription: {
    label: "choice.done.status.subscription",
    className: "bg-chip-solid text-ink",
  },
  locks: { label: "choice.done.status.locks", className: QUIET },
  needs_plan: { label: "choice.done.status.needs_plan", className: QUIET },
} as const satisfies Record<
  ChoiceOrgStatus,
  { label: `choice.done.status.${ChoiceOrgStatus}`; className: string }
>;

/**
 * Every org the person owns and what it is (or becomes at the cutover), as a
 * status pill. `meta` adds each org's members and activity under its name,
 * shorter than the picker's so a row and its pill share a phone's width.
 */
export function ChoiceOrgList({
  orgs,
  meta = false,
}: {
  orgs: ChoiceDoneOrg[];
  meta?: boolean;
}) {
  const { t, i18n } = useTranslation("plan");
  const orgName = useOrgName();
  return (
    <ul className="plan-briefing-stagger ht-hairline mb-3 divide-y divide-line rounded-xl bg-chip px-3.5 py-1">
      {orgs.map(({ org, status }) => (
        <li
          key={org.slug}
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5",
            meta && "gap-y-0.5",
          )}
        >
          <OrgAvatar
            slug={org.slug}
            name={orgName(org)}
            size="sm"
            className={cn(meta && "row-span-2")}
          />
          <span className="truncate text-sm font-medium text-ink">
            {orgName(org)}
          </span>
          {/* On a phone the pill sits beside the name so the activity line
              keeps the row's width; the desktop gives it its own column. */}
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
              meta && "md:row-span-2",
              STATUS[status].className,
            )}
          >
            {t(STATUS[status].label, {
              date: org.lockAt
                ? formatCutoverDay(org.lockAt, i18n.language)
                : "",
            })}
          </span>
          {meta && (
            <span className="col-span-2 col-start-2 text-pretty text-xs leading-snug text-ink-muted tabular-nums md:col-span-1">
              {t("choice.picker.meta", {
                first: t("choice.picker.members", { count: org.memberCount }),
                second:
                  org.messages30d > 0
                    ? t("choice.applied.messages", { count: org.messages30d })
                    : t("choice.applied.noMessages"),
              })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
