import {
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { constants } from "node:fs";
import {
  access as fsAccess,
  mkdir as fsMkdir,
  readdir as fsReaddir,
  readFile as fsReadFile,
  stat as fsStat,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { WorkspaceGuard } from "./fs-guard";

/**
 * Workspace-clamped file tools (cloud security Gate #1).
 *
 * pi's DEFAULT read/ls/grep/find/edit/write resolve absolute paths as-is, so a
 * prompt-injected agent could read any file the process can — including its
 * own auth.json — with no bash tool. These definitions shadow the builtins by
 * NAME (pi registers custom tools after built-ins, so same-name customs win)
 * and add two walls:
 *
 *  1. OUTER (load-bearing, all six tools): before pi's execute runs, the
 *     model-supplied `path` is resolved the way pi resolves it, validated
 *     against the workspace root (lexically AND symlink-resolved), and the
 *     param is REWRITTEN to the clamped absolute path. grep/find spawn rg/fd
 *     subprocesses on that path, so this is the only wall that constrains them.
 *  2. INNER (defense in depth): edit/write/ls/grep run their filesystem access
 *     through guarded `operations` that re-validate every absolute path pi
 *     hands them. read keeps pi's default operations (its image-sniffing
 *     pipeline is internal to pi and the outer wall fully constrains its one
 *     path param); find keeps its fd engine (an operations.glob override would
 *     replace the engine, not guard it).
 *
 * rg and fd are spawned without --follow, so neither traverses symlinks during
 * a search; a symlink given directly as `path` is rejected by the outer wall.
 */

export const CLAMPED_FILE_TOOL_NAMES = [
  "read",
  "ls",
  "grep",
  "find",
  "edit",
  "write",
] as const;

type AnyToolDefinition = ToolDefinition<TSchema, unknown, unknown>;

function withClampedPath(
  def: AnyToolDefinition,
  guard: WorkspaceGuard,
): AnyToolDefinition {
  return {
    ...def,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const raw: unknown = (params as { path?: unknown } | undefined)?.path;
      if (raw !== undefined && typeof raw !== "string") {
        throw new Error(`${def.name}: 'path' must be a string`);
      }
      const abs = guard.clamp(raw as string | undefined);
      return def.execute(
        toolCallId,
        { ...(params as object), path: abs },
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}

export function makeClampedFileTools(
  workspaceDir: string,
): AnyToolDefinition[] {
  const guard = new WorkspaceGuard(workspaceDir);
  const g = (p: string) => guard.assertInside(p);

  // Inner-wall operations mirror pi's defaults exactly, plus the guard.
  const editOps = {
    readFile: (p: string) => fsReadFile(g(p)),
    writeFile: (p: string, content: string) =>
      fsWriteFile(g(p), content, "utf-8"),
    access: (p: string) => fsAccess(g(p), constants.R_OK | constants.W_OK),
  };
  const writeOps = {
    writeFile: (p: string, content: string) =>
      fsWriteFile(g(p), content, "utf-8"),
    mkdir: (dir: string) => fsMkdir(g(dir), { recursive: true }).then(() => {}),
  };
  const lsOps = {
    exists: async (p: string) => {
      const abs = g(p); // an escape THROWS — it must never read as "doesn't exist"
      try {
        await fsStat(abs);
        return true;
      } catch {
        return false;
      }
    },
    stat: (p: string) => fsStat(g(p)),
    readdir: (p: string) => fsReaddir(g(p)),
  };
  const grepOps = {
    isDirectory: async (p: string) => (await fsStat(g(p))).isDirectory(),
    readFile: (p: string) => fsReadFile(g(p), "utf-8"),
  };

  return [
    withClampedPath(createReadToolDefinition(workspaceDir), guard),
    withClampedPath(
      createLsToolDefinition(workspaceDir, { operations: lsOps }),
      guard,
    ),
    withClampedPath(
      createGrepToolDefinition(workspaceDir, { operations: grepOps }),
      guard,
    ),
    withClampedPath(createFindToolDefinition(workspaceDir), guard),
    withClampedPath(
      createEditToolDefinition(workspaceDir, { operations: editOps }),
      guard,
    ),
    withClampedPath(
      createWriteToolDefinition(workspaceDir, { operations: writeOps }),
      guard,
    ),
  ];
}
