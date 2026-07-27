import { useTranslation } from "react-i18next";
import type { LearningProvenanceView } from "../../lib/learning-provenance";
import { PersonFace } from "../mission-person-face";

/**
 * The muted "where this memory came from" line under a learning: the person who
 * taught it (face + name) and the mission it came from. Rendered only when at
 * least one of the two is known — see `resolveLearningProvenance`, which returns
 * null otherwise, so a learning with no provenance keeps today's exact row.
 *
 * The face is the SAME `PersonFace` the person filter and the chat sender line
 * draw, so one human wears one avatar (and one tone) across every surface.
 */
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
