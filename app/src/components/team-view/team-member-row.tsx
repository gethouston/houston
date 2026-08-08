import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PersonRow,
  personRowTriggerClass,
} from "../organization/person-row.tsx";
import type { TeamMemberRow as MemberRow } from "./team-members-model.ts";

/**
 * One person in a team's Members card: the shared {@link PersonRow} shell (the
 * same one the Permissions agent People tab wears, so a person reads
 * identically wherever Houston lists people) filled with this surface's one
 * trailing control. The identity here is a single line: a team membership has
 * no second fact to state.
 *
 * The control is a single Owner / Member choice with Remove under a separator,
 * rather than a switch plus a delete button: both act on the same membership
 * row, and one menu keeps the right edge to one element at every width. Remove
 * wears the danger tone every destructive menu item in Houston wears. A row
 * that is not `editable` (the caller does not own this team, or it is the
 * caller's own row) shows the standing as static text, never a dead control.
 */
export function TeamMemberRowView({
  row,
  avatarUrl,
  disabled,
  onSetOwner,
  onRemove,
}: {
  row: MemberRow;
  /** Resolved avatar photo, or null for initials-only. */
  avatarUrl?: string | null;
  /** Locks the control while a write on this team is in flight. */
  disabled?: boolean;
  onSetOwner: (owner: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("teams");
  const label = row.owner
    ? t("agentTeams.settings.members.ownerLabel")
    : t("agentTeams.settings.members.memberLabel");

  return (
    <PersonRow
      name={row.name}
      avatarUrl={avatarUrl}
      isSelf={row.isSelf}
      selfLabel={t("agentTeams.settings.members.you")}
    >
      {row.editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-label={t("agentTeams.settings.members.changeRole", {
              name: row.name,
            })}
            className={personRowTriggerClass}
          >
            <span>{label}</span>
            <ChevronDown className="size-3.5 text-ink-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onSetOwner(true)}>
              <span className="flex-1">
                {t("agentTeams.settings.members.ownerLabel")}
              </span>
              {row.owner && <Check className="size-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetOwner(false)}>
              <span className="flex-1">
                {t("agentTeams.settings.members.memberLabel")}
              </span>
              {!row.owner && <Check className="size-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={onRemove}
            >
              {t("agentTeams.settings.members.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="shrink-0 text-sm text-ink-muted">{label}</span>
      )}
    </PersonRow>
  );
}
