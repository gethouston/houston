import { formatSkillDescription } from "./skill-marketplace-util";

export interface SkillDescriptionLabels {
  alsoMatches?: (keywords: string) => string;
}

const DEFAULT_LABELS: Required<SkillDescriptionLabels> = {
  alsoMatches: (keywords) => `Also matches: ${keywords}`,
};

/**
 * Renders a community skill's raw `description:` frontmatter readably: the
 * intro sentence, any `(1) ... (2) ...` enumeration as a real list, and a
 * trailing `Triggers on: "..."` keyword clause as a small muted caption
 * instead of run-on prose. See {@link formatSkillDescription}.
 */
export function SkillDescription({
  description,
  labels,
}: {
  description: string;
  labels?: SkillDescriptionLabels;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const { intro, items, keywords } = formatSkillDescription(description);

  return (
    <div className="space-y-3">
      {intro && <p className="text-sm leading-relaxed text-ink">{intro}</p>}
      {items.length > 0 && (
        <ol className="list-inside list-decimal space-y-1.5 text-sm leading-relaxed text-ink">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
      {keywords && (
        <p className="text-xs text-ink-muted">{l.alsoMatches(keywords)}</p>
      )}
    </div>
  );
}
