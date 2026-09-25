import { toolShortName } from "@houston-ai/chat";

/**
 * Which tool calls WROTE a file, in every dialect a turn can carry.
 *
 * Two naming dialects reach the transcript: the pi runtime's lowercase tools
 * (`write`, `edit` — `packages/runtime/src/session/tools/clamped-fs.ts`) and
 * the PascalCase `Write`/`Edit`/`MultiEdit` names a Claude-shaped toolset uses.
 * Matching one dialect only silently costs the user the file surfaces built on
 * this answer, so every surface asks HERE rather than keeping its own set.
 */

/** Matched on the LOWERCASED short name, which is what makes one set cover
 *  both dialects. */
const FILE_WRITE_TOOLS = new Set(["write", "edit", "multiedit", "multi_edit"]);

/** The tools that CREATE the file they name; the rest modify one in place. */
const FILE_CREATE_TOOLS = new Set(["write"]);

/** True when the call wrote the file its input names (created or modified). */
export function isFileWriteTool(name: string): boolean {
  return FILE_WRITE_TOOLS.has(toolShortName(name).toLowerCase());
}

/** True when the call CREATED the file its input names. */
export function isFileCreateTool(name: string): boolean {
  return FILE_CREATE_TOOLS.has(toolShortName(name).toLowerCase());
}
