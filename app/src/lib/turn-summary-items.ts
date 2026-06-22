import type { FileChangeEntry, ToolEntry } from "@houston-ai/chat";

export type SemanticUpdateKind = "instructions" | "skills" | "learnings";
export type FileUpdateKind = "created" | "modified";

export type TurnSummaryItem =
  | { kind: "file"; path: string; change: FileUpdateKind }
  | { kind: "semantic"; update: SemanticUpdateKind };

export interface TurnSummaryGroups {
  updates: TurnSummaryItem[];
  files: Extract<TurnSummaryItem, { kind: "file" }>[];
}

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const USER_FILE_EXTENSIONS = new Set([
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "gif",
  "txt",
  "rtf",
  "csv",
  // Plain-text formats agents routinely write as user-visible output. `md`
  // is the one that prompted this: a real user reported a `perfil.md`
  // from the agent never showed up in the "New files" section because md
  // wasn't on this allowlist (it was rejected on every OS, the Windows
  // separator bugs just made it harder to notice).
  "md",
  "markdown",
  "html",
  "json",
  "yaml",
  "yml",
]);

function shortName(name: string): string {
  return name.includes("__") ? name.split("__").pop()! : name;
}

/**
 * Path separators on Windows are `\`; on macOS / Linux they're `/`. The
 * engine emits absolute paths in the native separator of the host
 * (`C:\Users\jul\.houston\…\perfil.md` on Windows, `/Users/jul/…` on Mac),
 * so any code that did `path.split("/").pop()` to get a filename
 * returned the WHOLE path on Windows — that's why the "New files"
 * section never rendered correctly and CLAUDE.md / SKILL.md never
 * classified as semantic updates. Use this helper everywhere a
 * separator-aware split is needed.
 */
function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/** Replace `\` with `/` so prefix comparisons work regardless of OS. */
function toPosixSeparator(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizePath(path: string, agentPath: string): string {
  const trimmed = toPosixSeparator(path.trim());
  const root = toPosixSeparator(agentPath);
  if (trimmed.startsWith(`${root}/`)) return trimmed.slice(root.length + 1);
  return trimmed;
}

function classifyPath(
  path: string,
  agentPath: string,
): SemanticUpdateKind | null {
  const relative = normalizePath(path, agentPath).toLowerCase();
  const fileName = fileNameOf(relative);

  if (fileName === "claude.md" || fileName === "agents.md")
    return "instructions";
  if (relative === ".houston/learnings/learnings.json") return "learnings";
  if (
    relative.includes("/.agents/skills/") ||
    relative.includes("/.claude/skills/")
  ) {
    return "skills";
  }
  if (fileName === "skill.md" || fileName === "skills.md") return "skills";
  return null;
}

export function isUserVisibleFilePath(path: string): boolean {
  const fileName = fileNameOf(path);
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : "";
  return Boolean(ext && USER_FILE_EXTENSIONS.has(ext));
}

function extractPathsFromBashOutput(output: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const p = raw.trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };

  const labeled =
    /(?:saved|created|wrote|written|output|file):\s*([^\r\n]+\.[a-zA-Z0-9]{1,10})/gi;
  let match: RegExpExecArray | null;
  while ((match = labeled.exec(output)) !== null) add(match[1]);

  const bare = /^(\/[^\r\n]+\.[a-zA-Z0-9]{1,10})\s*$/gm;
  while ((match = bare.exec(output)) !== null) add(match[1]);

  return paths;
}

export function buildTurnSummaryItems(
  tools: ToolEntry[],
  agentPath: string,
  fileChanges: FileChangeEntry[] = [],
): TurnSummaryItem[] {
  const semantic = new Set<SemanticUpdateKind>();
  const files: Array<{ path: string; change: FileUpdateKind }> = [];
  const seenFiles = new Map<string, FileUpdateKind>();

  const addPath = (path: string, change: FileUpdateKind) => {
    const update = classifyPath(path, agentPath);
    if (update) {
      semantic.add(update);
      return;
    }
    if (!isUserVisibleFilePath(path)) return;

    const existing = seenFiles.get(path);
    if (existing === "created" || existing === change) return;
    if (existing === "modified" && change === "created") {
      seenFiles.set(path, change);
      const item = files.find((file) => file.path === path);
      if (item) item.change = change;
      return;
    }
    seenFiles.set(path, change);
    files.push({ path, change });
  };

  for (const change of fileChanges) {
    addPath(change.path, change.status);
  }

  for (const tool of tools) {
    if (!tool.result || tool.result.is_error) continue;
    const sn = shortName(tool.name);

    if (FILE_TOOLS.has(sn)) {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      const fp = inp?.file_path as string | undefined;
      if (fp) addPath(fp, sn === "Write" ? "created" : "modified");
    } else if (sn === "Bash") {
      for (const fp of extractPathsFromBashOutput(tool.result.content)) {
        addPath(fp, "created");
      }
    }
  }

  return [
    ...Array.from(semantic).map((update) => ({
      kind: "semantic" as const,
      update,
    })),
    ...files.map((file) => ({ kind: "file" as const, ...file })),
  ];
}

export function groupTurnSummaryItems(
  items: TurnSummaryItem[],
): TurnSummaryGroups {
  return {
    updates: items.filter(
      (item) => item.kind === "semantic" || item.change === "modified",
    ),
    files: items.filter(isCreatedFile),
  };
}

function isCreatedFile(
  item: TurnSummaryItem,
): item is Extract<TurnSummaryItem, { kind: "file" }> {
  return item.kind === "file" && item.change === "created";
}
