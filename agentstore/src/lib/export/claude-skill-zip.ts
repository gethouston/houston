/**
 * Export target A — Claude.ai Skill ZIP (default).
 *
 * The store's skills are already canonical SKILL.md files, so this adapter does
 * NOT synthesize skill markdown: each skill body goes in VERBATIM at
 * `<skill-slug>/SKILL.md` (folder-as-root, the verified Claude.ai upload shape).
 *
 * When the agent carries its own CLAUDE.md (`ir.instructions`), we additionally
 * emit one composed skill at `<agent-slug>/SKILL.md`: a two-key frontmatter
 * (`name` = agent slug, `description` = tagline or truncated description) over the
 * verbatim instructions body. No other content is invented.
 *
 * Bundles are byte-reproducible: every entry uses a fixed timestamp so the same
 * IR always yields the same ZIP (stable ETags / caching).
 */

import type { AgentIR } from "@houston/agentstore-contract";
import JSZip from "jszip";
import {
  SKILL_DESCRIPTION_MAX,
  taglineOrDescription,
  yamlString,
} from "./shared";

/** Fixed entry timestamp so identical IR produces byte-identical archives. */
const REPRODUCIBLE_DATE = new Date("2020-01-01T00:00:00.000Z");

/** The composed `<agent-slug>/SKILL.md` for the agent's own CLAUDE.md. Exported
 *  for golden tests. Returns null when the agent has no instructions. */
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

/**
 * Pick a unique folder for the agent's own instructions skill. Almost always the
 * agent slug; if a published skill already owns that folder, suffix so neither
 * the skill body nor the instructions is silently dropped.
 */
function uniqueAgentFolder(slug: string, used: Set<string>): string {
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n += 1) {
    const candidate = `${slug}-agent-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Build the Claude Skill ZIP. Returns the raw bytes and a suggested filename.
 * Entries are `<skill-slug>/SKILL.md` (verbatim) plus, when instructions exist,
 * `<agent-slug>/SKILL.md` (composed).
 */
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

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { bytes, filename: `${ir.identity.slug}.zip` };
}
