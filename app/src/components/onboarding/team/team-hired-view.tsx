import { useTranslation } from "react-i18next";
import { EmployeeCardDeck } from "../../employee-card/employee-card-deck";
import { RosterEmployeeCard } from "./roster-employee-card";
import type { RosterPatch } from "./team-roster-edit";
import type { RosterMember } from "./team-roster-model";

/**
 * The roster: everyone this card has hired, newest last, each on the employee
 * card they were welcomed with and editable in place. A hire still on its way
 * says so on its card, and one that failed carries its Retry. The actions
 * under it ("Hire another", "Done") are the card's footer.
 */
export function TeamHiredView({
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
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-balance text-2xl font-normal">
          {t("team.hired.title", { count: members.length })}
        </h2>
        <p className="text-sm text-ink-muted">{t("team.hired.subtitle")}</p>
      </div>
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
    </div>
  );
}
