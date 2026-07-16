import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { initialsFor, memberLabel } from "../organization/people-tab-model";

/**
 * Permissions > People: the member roster as a read-only list where each row
 * drills into that person's per-agent access lens ({@link MemberDetail}). Role
 * MANAGEMENT (invite / re-role / remove) stays in the Organization dashboard, so
 * the role here is a static chip only — this surface answers "which agents can
 * each person use", not "who is on the team".
 *
 * The view already gates to multiplayer owner/admin, so this never mounts in
 * single-player or for a plain member.
 */
export function PermissionsPeopleTab({
  members,
  selfId,
  onOpenMember,
}: {
  members: OrgMember[];
  selfId: string | null;
  onOpenMember: (member: OrgMember) => void;
}) {
  const { t } = useTranslation("teams");
  const { profiles } = useUserProfiles(members.map((m) => m.userId));

  if (members.length === 0) {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("permissions.people.empty.title")}</EmptyTitle>
        <EmptyDescription>
          {t("permissions.people.empty.body")}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => {
        const isSelf = member.userId === selfId;
        const avatarUrl = avatarUrlFromProfiles(profiles, member.userId);
        return (
          <li key={member.userId}>
            <button
              type="button"
              onClick={() => onOpenMember(member)}
              aria-label={t("people.roster.openLabel", {
                name: memberLabel(member),
              })}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-ink/5 bg-card px-4 py-3 text-left transition-colors hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20"
            >
              <Avatar>
                {avatarUrl && (
                  <AvatarImage
                    src={avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                )}
                <AvatarFallback className="text-xs">
                  {initialsFor(memberLabel(member))}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {memberLabel(member)}
                  {isSelf && (
                    <span className="ml-2 text-xs text-ink-muted">
                      {t("people.roster.you")}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-chip px-3 py-1 text-xs text-ink-muted">
                {t(`people.roles.${member.role}`)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
