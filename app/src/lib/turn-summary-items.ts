import type { FileChangeEntry, ToolEntry } from "@houston-ai/chat";
import { fileNameOf, toWorkspaceRelative } from "./agent-file-paths.ts";
import { skillFolderPathOf } from "./skill-folder-path.ts";
import {
  integrationUpdatesOf,
  type TurnIntegrationUpdate,
} from "./turn-integration-updates.ts";
import {
  extractPathsFromBashOutput,
  isUserVisibleFilePath,
} from "./user-visible-files.ts";

export type SemanticUpdateKind = "instructions" | "skills" | "learnings";
export type FileUpdateKind = "created" | "modified";

export type TurnSummaryItem =
  | { kind: "file"; path: string; change: FileUpdateKind }
  | { kind: "semantic"; update: SemanticUpdateKind }
  /** One named skill the turn SAVED (its `SKILL.md` was written). */
  | { kind: "skill"; slug: string }
  | TurnIntegrationUpdate;

export interface TurnSummaryGroups {
  updates: TurnSummaryItem[];
  files: Extract<TurnSummaryItem, { kind: "file" }>[];
}

/**
 * The file-writing tools of BOTH dialects, matched on the lowercased short
 * name: Claude's PascalCase names and the pi runtime's lowercase ones
 * (`packages/runtime/src/session/tools/clamped-fs.ts`). Matching one dialect
 * only left every pi turn with no summary rows at all — a saved skill showed
 * up as nothing but a collapsed "Wrote file" line in the task log.
 */
const FILE_TOOLS = new Set(["write", "edit", "multiedit", "multi_edit"]);
/** The tools that CREATE the file they name; the rest modify one in place. */
const CREATE_TOOLS = new Set(["write"]);

function shortName(name: string): string {
  return name.includes("__") ? (name.split("__").pop() ?? name) : name;
}

/** A semantic update, carrying the skill identity when the path names one. */
interface PathClassification {
  update: SemanticUpdateKind;
  /** Set for a path inside a skill folder (see skill-folder-path.ts). */
  slug?: string;
  /** True only for the skill folder's own `SKILL.md`. */
  isSkillFile?: boolean;
}

/** Takes an ALREADY workspace-relative path (see `addPath`). */
function classifyPath(relative: string): PathClassification | null {
  const lower = relative.toLowerCase();
  const fileName = fileNameOf(lower);

  if (fileName === "claude.md" || fileName === "agents.md")
    return { update: "instructions" };
  if (lower === ".houston/learnings/learnings.json")
    return { update: "learnings" };

  const skill = skillFolderPathOf(relative);
  if (skill) return { update: "skills", ...skill };
  if (fileName === "skill.md" || fileName === "skills.md")
    return { update: "skills" };
  return null;
}

export function buildTurnSummaryItems(
  tools: ToolEntry[],
  agentPath: string,
  fileChanges: FileChangeEntry[] = [],
): TurnSummaryItem[] {
  const semantic = new Set<SemanticUpdateKind>();
  /** Slugs whose own `SKILL.md` was written — one named row each. */
  const savedSkills = new Set<string>();
  /** Slugs touched some other way; `""` when the path names no folder. */
  const otherSkillWork = new Set<string>();
  // Keyed by the workspace-relative path, which dedupes the SAME file arriving
  // absolute from a tool input and relative from a `file_changes` frame; the
  // value keeps the spelling first seen, which every opener accepts.
  const files = new Map<string, { path: string; change: FileUpdateKind }>();

  const addPath = (path: string, change: FileUpdateKind) => {
    // Separator handling matters here: the engine emits absolute paths in the
    // HOST's native separator, so a plain `path.split("/").pop()` returned the
    // whole path on Windows — the "New files" section never rendered correctly
    // and CLAUDE.md / SKILL.md never classified as semantic updates. The shared
    // helpers in agent-file-paths.ts are separator-agnostic.
    const relative = toWorkspaceRelative(path, { folderPath: agentPath });
    const update = classifyPath(relative);
    if (update) {
      // Writing `<slug>/SKILL.md` IS saving that skill, so the rail can name
      // it. Any other work inside a skill folder — a reference doc, a patch to
      // an existing SKILL.md — stays the generic "Skills updated" row.
      if (update.update !== "skills") semantic.add(update.update);
      else if (update.isSkillFile && update.slug && change === "created")
        savedSkills.add(update.slug);
      else otherSkillWork.add(update.slug ?? "");
      return;
    }
    if (!isUserVisibleFilePath(relative)) return;

    const existing = files.get(relative);
    if (!existing) {
      files.set(relative, { path, change });
      return;
    }
    // "Created" wins: a file both written and edited in one turn is new.
    if (change === "created") existing.change = change;
  };

  for (const change of fileChanges) {
    addPath(change.path, change.status);
  }

  for (const tool of tools) {
    if (!tool.result || tool.result.is_error) continue;
    const sn = shortName(tool.name).toLowerCase();

    if (FILE_TOOLS.has(sn)) {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      // Claude tools carry `file_path`; pi tools carry `path`.
      const fp = (inp?.file_path ?? inp?.path) as string | undefined;
      if (fp) addPath(fp, CREATE_TOOLS.has(sn) ? "created" : "modified");
    } else if (sn === "bash") {
      for (const fp of extractPathsFromBashOutput(tool.result.content)) {
        addPath(fp, "created");
      }
    }
  }

  // A skill whose SKILL.md was saved already has a row that names it; the
  // generic row is only for skill work no named row covers.
  const uncoveredSkillWork = Array.from(otherSkillWork).some(
    (slug) => !slug || !savedSkills.has(slug),
  );
  if (uncoveredSkillWork) semantic.add("skills");

  return [
    // External-artifact actions lead: they are the updates the user most wants
    // to review (and click through to) at a glance (PRODUCT-1196).
    ...integrationUpdatesOf(tools),
    ...Array.from(savedSkills).map((slug) => ({
      kind: "skill" as const,
      slug,
    })),
    ...Array.from(semantic).map((update) => ({
      kind: "semantic" as const,
      update,
    })),
    ...Array.from(files.values()).map((file) => ({
      kind: "file" as const,
      ...file,
    })),
  ];
}

export function groupTurnSummaryItems(
  items: TurnSummaryItem[],
): TurnSummaryGroups {
  return {
    updates: items.filter(
      (item) => item.kind !== "file" || item.change === "modified",
    ),
    files: items.filter(isCreatedFile),
  };
}

function isCreatedFile(
  item: TurnSummaryItem,
): item is Extract<TurnSummaryItem, { kind: "file" }> {
  return item.kind === "file" && item.change === "created";
}
