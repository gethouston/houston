import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useActivity,
  useLearnings,
  useLearningWrites,
} from "../../../hooks/queries";
import { useUserProfiles } from "../../../hooks/queries/use-user-profiles";
import {
  collectTaughtByIds,
  resolveLearningProvenance,
} from "../../../lib/learning-provenance";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { OrgLockedFieldset } from "../../shell/org-locked-fieldset";
import { PageHero } from "../../shell/page-shell";
import { LearningsContent } from "../learnings-content";

/** Memory (learnings) section. */
export function AgentAdminKnowledge({ agent }: AgentSectionProps) {
  const { t } = useTranslation(["teams", "agents"]);
  const path = agent.folderPath;
  const { data } = useLearnings(path);
  const writes = useLearningWrites(path);

  const entries = data?.entries ?? [];
  // Faces for whoever taught these learnings. The hook is multiplayer-gated, so
  // single player / desktop resolves nothing and the line falls back to the name
  // stored on the learning itself.
  const { profiles } = useUserProfiles(collectTaughtByIds(entries));
  // Live mission titles, so a renamed mission reads correctly; the title stored
  // at save time covers a mission that was since deleted.
  const { data: activities } = useActivity(path);
  const missionTitles = useMemo(
    () => new Map((activities ?? []).map((a) => [a.id, a.title])),
    [activities],
  );

  // The card takes the RESOLVED line only; the raw provenance fields stop here.
  const rows = useMemo(
    () =>
      entries.map(({ index, text, id, ...source }) => ({
        index,
        text,
        id,
        provenance: resolveLearningProvenance(source, profiles, missionTitles),
      })),
    [entries, profiles, missionTitles],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-12">
      <PageHero
        level={2}
        className="mb-6"
        title={t("teams:agentAdmin.rows.knowledge.title")}
        subtitle={t("agents:learnings.helper")}
      />
      <OrgLockedFieldset>
        <LearningsContent
          layout="section"
          showHelper={false}
          entries={rows}
          onAdd={writes.add}
          onRemove={writes.remove}
          onUpdate={writes.update}
        />
      </OrgLockedFieldset>
    </div>
  );
}
