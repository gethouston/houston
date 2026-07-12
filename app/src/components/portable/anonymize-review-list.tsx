/**
 * The per-item review list of an anonymize pass: instructions, skills,
 * routines and learnings, each with its own keep/skip toggle. Owns the
 * accept-state plumbing so the step component stays focused on flow.
 */

import type { PortableAnonymizeResponse } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { AnonymizeAccept } from "../../lib/portable-share";
import { DiffCard, RoutineDiffCard } from "./anonymize-diff-cards";
import { humanize } from "./wizard-parts";

export function AnonymizeReviewList({
  anonymized,
  accept,
  setAccept,
}: {
  anonymized: PortableAnonymizeResponse;
  accept: AnonymizeAccept;
  setAccept: (a: AnonymizeAccept) => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-3">
      {anonymized.claudeMd && (
        <DiffCard
          title={t("export.step2.diffInstructions")}
          before={anonymized.claudeMd.before}
          after={anonymized.claudeMd.after}
          summary={anonymized.claudeMd.summary}
          becameEmpty={anonymized.claudeMd.becameEmpty}
          accepted={accept.claudeMd}
          onToggle={() => setAccept({ ...accept, claudeMd: !accept.claudeMd })}
        />
      )}
      {anonymized.skills.map((s) => (
        <DiffCard
          key={s.id}
          title={humanize(s.id)}
          before={s.before}
          after={s.after}
          summary={s.summary}
          becameEmpty={s.becameEmpty}
          accepted={accept.skills[s.id] ?? true}
          onToggle={() =>
            setAccept({
              ...accept,
              skills: { ...accept.skills, [s.id]: !accept.skills[s.id] },
            })
          }
        />
      ))}
      {anonymized.routines.map((r) =>
        r.fieldDiffs.length > 0 ? (
          <RoutineDiffCard
            key={r.id}
            routineId={r.id}
            fieldDiffs={r.fieldDiffs}
            accepted={accept.routines[r.id] ?? true}
            onToggle={() =>
              setAccept({
                ...accept,
                routines: {
                  ...accept.routines,
                  [r.id]: !accept.routines[r.id],
                },
              })
            }
          />
        ) : null,
      )}
      {anonymized.learnings.map((l) => (
        <DiffCard
          key={l.id}
          title={t("export.step2.learningTitle")}
          before={l.before}
          after={l.after}
          summary={l.summary}
          becameEmpty={l.becameEmpty}
          accepted={accept.learnings[l.id] ?? true}
          onToggle={() =>
            setAccept({
              ...accept,
              learnings: {
                ...accept.learnings,
                [l.id]: !accept.learnings[l.id],
              },
            })
          }
        />
      ))}
    </div>
  );
}
