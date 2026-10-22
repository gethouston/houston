import type { OrgMember, OrgRole } from "@houston/engine-adapter";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { GRANTABLE_ROLES } from "../../lib/org-roles";
import { initialsFor, rosterPersonName } from "./people-tab-model";

/**
 * One member on the People roster: avatar, name/email and role, with the
 * role dropdown and Remove when the caller may edit them. `focused` is the
 * person People was opened on, ringed and announced as the current row.
 */
export function PeopleRosterRow({
  member,
  isSelf,
  editable,
  focused,
  onRole,
  onRemove,
}: {
  member: OrgMember;
  isSelf: boolean;
  editable: boolean;
  focused: boolean;
  onRole: (role: OrgRole) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("teams");
  // Display name is primary when the gateway resolved one; the email then
  // drops to a muted secondary line. Unnamed accounts use translated copy.
  const name = rosterPersonName(member, t("people.roster.unnamedAccount"));
  const secondaryEmail =
    member.displayName && member.email ? member.email : null;
  const avatarUrl = member.photoUrl ?? null;
  const roleLabel = (role: OrgRole) => t(`people.roles.${role}`);

  return (
    <li
      data-person={member.userId}
      aria-current={focused ? "true" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-ink/5 bg-card px-4 py-3",
        focused && "ring-2 ring-link/40",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar>
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xs">
            {initialsFor(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">
            {name}
            {isSelf && (
              <span className="ml-2 text-xs text-ink-muted">
                {t("people.roster.you")}
              </span>
            )}
          </div>
          {secondaryEmail && (
            <div className="truncate text-xs text-ink-muted">
              {secondaryEmail}
            </div>
          )}
        </div>
      </div>
      {editable ? (
        <Select
          value={member.role}
          onValueChange={(value) => onRole(value as OrgRole)}
        >
          <SelectTrigger
            className="h-8 w-32 rounded-full"
            aria-label={t("people.roster.changeRole", { name })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRANTABLE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabel(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="rounded-full bg-chip px-3 py-1 text-xs text-ink-muted">
          {roleLabel(member.role)}
        </span>
      )}
      {editable && (
        <Button
          variant="ghost"
          className="rounded-full text-danger hover:text-danger"
          aria-label={t("people.roster.removeLabel", { name })}
          onClick={onRemove}
        >
          {t("people.roster.remove")}
        </Button>
      )}
    </li>
  );
}
