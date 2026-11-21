import { useTranslation } from "react-i18next";
import type { LearningProvenanceView } from "../../lib/learning-provenance";
import { PersonFace } from "../mission-person-face";

export function LearningProvenanceLine({
  provenance,
}: {
  provenance: LearningProvenanceView;
}) {
  const { t } = useTranslation("agents");
  const { name, personId, photoUrl, mission } = provenance;
  const label =
    name && mission
      ? t("learnings.provenanceFromMission", { name, mission })
      : name
        ? t("learnings.provenanceFrom", { name })
        : t("learnings.provenanceMission", { mission });

  return (
    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
      {name && (
        <PersonFace
          person={{
            label: name,
            ...(personId ? { id: personId } : {}),
            ...(photoUrl ? { imageUrl: photoUrl } : {}),
          }}
        />
      )}
      <span className="truncate">{label}</span>
    </p>
  );
}
