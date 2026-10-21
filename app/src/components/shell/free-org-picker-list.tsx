import type { ChoiceDoneOrg, ChoiceOrgStatus } from "@houston/sdk";
import { formatCutoverDay } from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useOrgMeta, useOrgName } from "./free-org-picker-rows";
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
 * the way the picker lists them, for a list the person is asked to confirm.
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
  const orgMeta = useOrgMeta();
  return (
    <ul className="plan-briefing-stagger ht-hairline mb-3 divide-y divide-line rounded-xl bg-chip px-3.5 py-1">
      {orgs.map(({ org, status }) => (
        <li
          key={org.slug}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5"
        >
          <OrgAvatar slug={org.slug} name={orgName(org)} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {orgName(org)}
            </span>
            {meta && (
              <span className="mt-0.5 block text-xs leading-snug text-ink-muted tabular-nums">
                {orgMeta(org)}
              </span>
            )}
          </span>
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS[status].className,
            )}
          >
            {t(STATUS[status].label, {
              date: org.lockAt
                ? formatCutoverDay(org.lockAt, i18n.language)
                : "",
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
