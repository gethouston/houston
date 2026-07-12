/**
 * Step 1 of the portable share flow: pick what goes into the copy. CLAUDE.md
 * is implicit; skills, routines and learnings get per-item switches.
 */

import type { PortableInventoryPreview } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { WizardSelection } from "../../lib/portable-share";
import { humanize, Section, Subtle, SwitchRow } from "./wizard-parts";

export function PickStep({
  preview,
  selection,
  setSelection,
}: {
  preview: PortableInventoryPreview;
  selection: WizardSelection;
  setSelection: (s: WizardSelection) => void;
}) {
  const { t } = useTranslation("portable");
  const toggleSkill = (slug: string) => {
    const next = new Set(selection.skillSlugs);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    setSelection({ ...selection, skillSlugs: next });
  };
  const toggleRoutine = (id: string) => {
    const next = new Set(selection.routineIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelection({ ...selection, routineIds: next });
  };
  const toggleLearning = (id: string) => {
    const next = new Set(selection.learningIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelection({ ...selection, learningIds: next });
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("export.step1.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("export.step1.body")}
        </p>
      </header>

      <Section title={t("export.step1.instructionsLabel")}>
        {preview.claudeMd ? (
          <SwitchRow
            checked={selection.claudeMd}
            onChange={() =>
              setSelection({ ...selection, claudeMd: !selection.claudeMd })
            }
            title={t("export.step1.instructionsRow")}
            subtitle={preview.claudeMd.excerpt}
          />
        ) : (
          <Subtle>{t("export.step1.noInstructions")}</Subtle>
        )}
      </Section>

      {preview.skills.length > 0 && (
        <Section title={t("export.step1.skillsLabel")}>
          {preview.skills.map((s) => (
            <SwitchRow
              key={s.slug}
              checked={selection.skillSlugs.has(s.slug)}
              onChange={() => toggleSkill(s.slug)}
              title={humanize(s.slug)}
              subtitle={s.description}
            />
          ))}
        </Section>
      )}

      {preview.routines.length > 0 && (
        <Section title={t("export.step1.routinesLabel")}>
          {preview.routines.map((r) => (
            <SwitchRow
              key={r.id}
              checked={selection.routineIds.has(r.id)}
              onChange={() => toggleRoutine(r.id)}
              title={r.name}
              subtitle={r.promptExcerpt}
            />
          ))}
        </Section>
      )}

      {preview.learnings.length > 0 && (
        <Section title={t("export.step1.learningsLabel")}>
          {preview.learnings.map((l) => (
            <SwitchRow
              key={l.id}
              checked={selection.learningIds.has(l.id)}
              onChange={() => toggleLearning(l.id)}
              title={l.text}
            />
          ))}
        </Section>
      )}
    </div>
  );
}
