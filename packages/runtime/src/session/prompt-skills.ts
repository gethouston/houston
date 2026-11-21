import { realpathSync } from "node:fs";
import { sep } from "node:path";
import type { LoadSkillsResult, Skill } from "@earendil-works/pi-coding-agent";

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export function skillsForPrompt<
  T extends Pick<Skill, "name" | "filePath" | "description">,
>(skills: readonly T[]): T[] {
  return [...skills]
    .sort(
      (a, b) =>
        byCodeUnit(a.name, b.name) || byCodeUnit(a.filePath, b.filePath),
    )
    .map((skill) => ({ ...skill, description: indexLine(skill.description) }));
}

const INDEX_LINE_CHARS = 200;

const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[\p{Lu}¿¡])/u;

const TRIGGER_LEAD =
  /^(?:(?:use|usa|usar|úsala|úsalo|invoke)\b[^.!?]{0,20}?\b(?:when|whenever|if|cuando|quando)\b|triggers?(?:\s+(?:on|when|include|phrases?|words?)\b|\s*:))/iu;

const TRIGGER_END = /(?<=[.!?])\s+(?=[\p{Lu}¿¡])|\s+[-–—]\s+/u;

export function indexLine(description: string): string {
  const flat = description.replace(/\s+/g, " ").trim();
  const end = TRIGGER_LEAD.test(flat) ? TRIGGER_END.exec(flat) : null;
  const outcome = end ? flat.slice(end.index + end[0].length) : "";
  const text = outcome && !TRIGGER_LEAD.test(outcome) ? outcome : flat;
  const sentence = text.split(SENTENCE_BREAK)[0] ?? text;
  if (sentence.length <= INDEX_LINE_CHARS) return sentence;
  const cut = sentence.slice(0, INDEX_LINE_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:]+$/, "")}…`;
}

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

export function agentSkillsOverride(
  sharedSkillsDir: string | null,
  enabledSharedSkills: ReadonlySet<string>,
): (base: LoadSkillsResult) => LoadSkillsResult {
  return ({ skills, diagnostics }) => {
    if (!sharedSkillsDir)
      return { skills: skillsForPrompt(skills), diagnostics };
    const isShared = (baseDir: string) =>
      isWithin(realpathSync(baseDir), sharedSkillsDir);
    const localNames = new Set(
      skills
        .filter((skill) => !isShared(skill.baseDir))
        .map((skill) => skill.name),
    );
    return {
      skills: skillsForPrompt(
        skills.filter(
          (skill) =>
            !isShared(skill.baseDir) ||
            (enabledSharedSkills.has(skill.name) &&
              !localNames.has(skill.name)),
        ),
      ),
      diagnostics,
    };
  };
}
