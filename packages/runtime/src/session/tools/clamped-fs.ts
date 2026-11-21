import { constants } from "node:fs";
import {
  access as fsAccess,
  mkdir as fsMkdir,
  readdir as fsReaddir,
  readFile as fsReadFile,
  stat as fsStat,
  writeFile as fsWriteFile,
} from "node:fs/promises";
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
import { assertNotPlanMode } from "../live-mode-gate";
import { WorkspaceGuard, type WorkspaceGuardOptions } from "./fs-guard";
import { documentReadOperations } from "./read-documents";

export const CLAMPED_FILE_TOOL_NAMES = [
  "read",
  "ls",
  "grep",
  "find",
  "edit",
  "write",
] as const;

type AnyToolDefinition = ToolDefinition<TSchema, unknown, unknown>;

function withPlanGate(def: AnyToolDefinition): AnyToolDefinition {
  return {
    ...def,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      assertNotPlanMode("create, edit, or delete the user's files");
      return def.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  };
}

function withClampedPath(
  def: AnyToolDefinition,
  guard: WorkspaceGuard,
  write = false,
): AnyToolDefinition {
  return {
    ...def,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const raw: unknown = (params as { path?: unknown } | undefined)?.path;
      if (raw !== undefined && typeof raw !== "string") {
        throw new Error(`${def.name}: 'path' must be a string`);
      }
      const abs = write
        ? guard.clampWrite(raw as string | undefined)
        : guard.clamp(raw as string | undefined);
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
  options?: WorkspaceGuardOptions,
): AnyToolDefinition[] {
  const guard = new WorkspaceGuard(workspaceDir, options);
  const g = (path: string) => guard.assertInside(path);
  const writable = (path: string) => guard.assertWritable(path);

  const editOps = {
    readFile: (p: string) => fsReadFile(g(p)),
    writeFile: (p: string, content: string) =>
      fsWriteFile(writable(p), content, "utf-8"),
    access: (p: string) => fsAccess(g(p), constants.R_OK | constants.W_OK),
  };
  const writeOps = {
    writeFile: (p: string, content: string) =>
      fsWriteFile(writable(p), content, "utf-8"),
    mkdir: (dir: string) =>
      fsMkdir(writable(dir), { recursive: true }).then(() => {}),
  };
  const lsOps = {
    exists: async (p: string) => {
      const abs = g(p);
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
    withClampedPath(
      createReadToolDefinition(workspaceDir, {
        operations: documentReadOperations,
      }),
      guard,
    ),
    withClampedPath(
      createLsToolDefinition(workspaceDir, { operations: lsOps }),
      guard,
    ),
    withClampedPath(
      createGrepToolDefinition(workspaceDir, { operations: grepOps }),
      guard,
    ),
    withClampedPath(createFindToolDefinition(workspaceDir), guard),
    withPlanGate(
      withClampedPath(
        createEditToolDefinition(workspaceDir, { operations: editOps }),
        guard,
        true,
      ),
    ),
    withPlanGate(
      withClampedPath(
        createWriteToolDefinition(workspaceDir, { operations: writeOps }),
        guard,
        true,
      ),
    ),
  ];
}
