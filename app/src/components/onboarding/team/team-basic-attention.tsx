import { CircleAlert } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { EmployeeCardDeck } from "../../employee-card/employee-card-deck";
import { RosterEmployeeCard } from "./roster-employee-card";
import type { RosterPatch } from "./team-roster-edit";
import type { RosterMember } from "./team-roster-model";

/**
 * On the basic team screen, the hires made one by one whose create or save
 * failed. They live on the roster, off this screen, yet the team only
 * finishes once they are tried again (or a failed create is let go), so they
 * are named here, each on its own card saying why.
 */
export function TeamBasicAttention({
  members,
  takenNames,
  onEdit,
  onRetry,
  onRemove,
}: {
  members: readonly RosterMember[];
  takenNames: readonly string[];
  onEdit: (key: string, patch: RosterPatch) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const { t } = useTranslation("setup");
  const headingId = useId();
  if (members.length === 0) return null;
  const notJoined = members.filter((m) => m.status.kind === "failed");
  const heading =
    notJoined.length > 0
      ? t("team.basic.attention", {
          count: notJoined.length,
          name: notJoined[0].name,
        })
      : t("team.basic.unsaved", {
          count: members.length,
          name: members[0].name,
        });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <p
        id={headingId}
        className="flex items-start gap-2 text-sm font-medium text-ink"
      >
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-danger"
        />
        {heading}
      </p>
      <EmployeeCardDeck
        items={members.map((member) => ({
          key: member.key,
          card: (
            <RosterEmployeeCard
              member={member}
              takenNames={takenNames}
              onEdit={(patch) => onEdit(member.key, patch)}
              onRetry={() => onRetry(member.key)}
              onRemove={() => onRemove(member.key)}
            />
          ),
        }))}
      />
    </section>
  );
}
