import type { AgentIR } from "@houston/agentstore-contract";
import JSZip from "jszip";
import {
  SKILL_DESCRIPTION_MAX,
  taglineOrDescription,
  yamlString,
} from "./shared";

const REPRODUCIBLE_DATE = new Date("2020-01-01T00:00:00.000Z");

export function buildAgentSkillMarkdown(ir: AgentIR): string | null {
  const instructions = ir.instructions.trim();
  if (!instructions.length) return null;

  const frontmatter = [
    "---",
    `name: ${yamlString(ir.identity.slug)}`,
    `description: ${yamlString(taglineOrDescription(ir, SKILL_DESCRIPTION_MAX))}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n${instructions}\n`;
}

function uniqueAgentFolder(slug: string, used: Set<string>): string {
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n += 1) {
    const candidate = `${slug}-agent-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export async function buildClaudeSkillZip(
  ir: AgentIR,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const zip = new JSZip();
  const used = new Set<string>();

  for (const skill of ir.skills) {
    used.add(skill.slug);
    zip.file(`${skill.slug}/SKILL.md`, skill.body, { date: REPRODUCIBLE_DATE });
  }

  const agentSkill = buildAgentSkillMarkdown(ir);
  if (agentSkill) {
    const folder = uniqueAgentFolder(ir.identity.slug, used);
    zip.file(`${folder}/SKILL.md`, agentSkill, { date: REPRODUCIBLE_DATE });
  }

  zip.forEach((_, entry) => {
    entry.date = REPRODUCIBLE_DATE;
  });

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { bytes, filename: `${ir.identity.slug}.zip` };
}
