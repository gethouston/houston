import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShareAction } from "../agent/agent-access-model.ts";
import { memberLabel } from "../organization/people-tab-model.ts";
import {
  PersonRow,
  personRowTriggerClass,
} from "../organization/person-row.tsx";
import type { AgentPersonRow as Row } from "./agent-people-model.ts";

/** The translated label for a member's current level on this agent. */
function levelLabel(level: Row["level"], t: (k: string) => string): string {
  if (level === "manager") return t("share.levels.manager");
  if (level === "user") return t("share.levels.user");
  return t("permissions.agentPeople.none");
}

/**
 * One member row in the Permissions agent People tab: the shared
 * {@link PersonRow} shell (the same one a team's Members card wears) carrying
 * the member's identity over their org role, with a None / Can use / Manager
 * control on the right.
 * The org owner renders as a static "Owner, always has access" (never editable);
 * everyone else gets a dropdown whose Manager option is disabled with an inline
 * reason for teammates without a Manager seat (`canBeManager` false). The trigger
 * shows the current level at rest (no hover gating); `onAction` fires the chosen
 * transition and the parent owns the write + self-lockout confirm.
 *
 * `readOnly` (the roster under "Everyone on your team", where per-person levels
 * are not the agent's state) renders the level as a static label with NO
 * control, so the row still says WHO can use the agent without a dead
 * affordance.
 */
export function AgentPersonRow({
  row,
  avatarUrl,
  disabled,
  readOnly,
  onAction,
}: {
  row: Row;
  /** Resolved avatar photo, or null for initials-only. */
  avatarUrl?: string | null;
  /** Locks the control while a write is in flight. */
  disabled?: boolean;
  /** View-only: show the level as static text, no dropdown. */
  readOnly?: boolean;
  onAction: (action: ShareAction) => void;
}) {
  const { t } = useTranslation("teams");
  const name = memberLabel(row.member);
  const label = levelLabel(row.level, t);

  return (
    // Identity reads as two calm lines (name, org role) so the right edge
    // carries exactly ONE element — the access control (or its static label).
    <PersonRow
      name={name}
      avatarUrl={avatarUrl}
      isSelf={row.isSelf}
      selfLabel={t("share.you")}
      secondary={t(`people.roles.${row.member.role}`)}
    >
      {row.isOwner ? (
        <span className="shrink-0 text-[13px] text-ink-muted">
          {t("share.ownerAccess")}
        </span>
      ) : readOnly ? (
        <span className="shrink-0 text-sm text-ink-muted">{label}</span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-label={t("permissions.agentPeople.changeAccess", { name })}
            className={personRowTriggerClass}
          >
            <span>{label}</span>
            <ChevronDown className="size-3.5 text-ink-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              disabled={!row.canBeManager}
              onSelect={() => onAction("manager")}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.manager")}</span>
                  {row.level === "manager" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {row.canBeManager
                    ? t("share.levels.managerHint")
                    : t("share.managerRequiresSeat")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("user")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("share.levels.user")}</span>
                  {row.level === "user" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {t("share.levels.userHint")}
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction("remove")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t("permissions.agentPeople.none")}</span>
                  {row.level === "none" && <Check className="size-3.5" />}
                </div>
                <p className="text-xs text-ink-muted">
                  {t("permissions.agentPeople.noneHint")}
                </p>
              </div>
            </DropdownMenuItem>
            {row.isSelf && (
              <DropdownMenuLabel className="text-xs font-normal text-ink-muted">
                {t("share.selfNote")}
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </PersonRow>
  );
}
