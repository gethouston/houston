import {
  type FileChangeEntry,
  type ToolEntry,
  toolShortName,
} from "@houston-ai/chat";
import { fileNameOf, toWorkspaceRelative } from "./agent-file-paths.ts";
import { isFileCreateTool, isFileWriteTool } from "./file-write-tools.ts";
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
  | { kind: "skill"; slug: string }
  | TurnIntegrationUpdate;

export interface TurnSummaryGroups {
  updates: TurnSummaryItem[];
  files: Extract<TurnSummaryItem, { kind: "file" }>[];
}

interface PathClassification {
  update: SemanticUpdateKind;
  slug?: string;
  isSkillFile?: boolean;
}

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
  const savedSkills = new Set<string>();
  const otherSkillWork = new Set<string>();
  const files = new Map<string, { path: string; change: FileUpdateKind }>();

  const addPath = (path: string, change: FileUpdateKind) => {
    const relative = toWorkspaceRelative(path, { folderPath: agentPath });
    const update = classifyPath(relative);
    if (update) {
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
    if (change === "created") existing.change = change;
  };

  for (const change of fileChanges) {
    addPath(change.path, change.status);
  }

  for (const tool of tools) {
    if (!tool.result || tool.result.is_error) continue;

    if (isFileWriteTool(tool.name)) {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      const fp = (inp?.file_path ?? inp?.path) as string | undefined;
      if (fp) addPath(fp, isFileCreateTool(tool.name) ? "created" : "modified");
    } else if (toolShortName(tool.name).toLowerCase() === "bash") {
      for (const fp of extractPathsFromBashOutput(tool.result.content)) {
        addPath(fp, "created");
      }
    }
  }

  const uncoveredSkillWork = Array.from(otherSkillWork).some(
    (slug) => !slug || !savedSkills.has(slug),
  );
  if (uncoveredSkillWork) semantic.add("skills");

  return [
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
