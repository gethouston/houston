import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { initialsFor, memberLabel } from "../organization/people-tab-model.ts";
import type { ShareAction } from "../tabs/agent-access-model.ts";
import type { AgentPersonRow as PersonRow } from "./agent-people-model.ts";

/** The translated label for a member's current level on this agent. */
function levelLabel(
  level: PersonRow["level"],
  t: (k: string) => string,
): string {
  if (level === "manager") return t("share.levels.manager");
  if (level === "user") return t("share.levels.user");
  return t("permissions.agentPeople.none");
}

/**
 * One member row in the Permissions agent People tab: the member's identity and
 * org-role chip on the left, a None / Can use / Manager control on the right.
 * The org owner renders as a static "Owner, always has access" (never editable);
 * everyone else gets a dropdown whose Manager option is disabled with an inline
 * reason for teammates without a Manager seat (`canBeManager` false). The trigger
 * shows the current level at rest (no hover gating); `onAction` fires the chosen
 * transition and the parent owns the write + self-lockout confirm.
 *
 * `readOnly` (a viewer who can't manage the agent — e.g. the agent's Permissions
 * tab seen by a non-manager) renders the level as a static label with NO control,
 * so everyone sees WHY the agent can or can't be used without a dead affordance.
 */
export function AgentPersonRow({
  row,
  avatarUrl,
  disabled,
  readOnly,
  onAction,
}: {
  row: PersonRow;
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
    // The flat page language: transparent row, no card chrome. Identity reads
    // as two calm lines (name, org role) so the right edge carries exactly ONE
    // element — the access control (or its static label).
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <Avatar>
        {avatarUrl && (
          <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback className="text-xs">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">
          {name}
          {row.isSelf && (
            <span className="ml-1.5 text-xs text-ink-muted">
              {t("share.you")}
            </span>
          )}
        </p>
        <p className="truncate text-[13px] text-ink-muted">
          {t(`people.roles.${row.member.role}`)}
        </p>
      </div>

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
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-sm text-ink hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:opacity-50"
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
    </li>
  );
}
