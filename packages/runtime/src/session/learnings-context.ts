import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ASSISTANT_AGENT_NAME } from "@houston/host/src/routes/assistant";
import type { Learning } from "@houston/protocol";

/**
 * The personal assistant's saved memory, folded into its system prompt.
 *
 * Every other agent recalls learnings only when it looks them up; the personal
 * assistant is the one agent whose whole job is knowing the user, so its memory
 * is ALWAYS injected. The only process-level signal that this runtime IS the
 * assistant is the basename of its agent root — a runtime is bound to one agent
 * directory (`config.workspaceDir`) and no conversation id exists yet when the
 * prompt is assembled.
 *
 * There is deliberately no `.houston` gate here: the assistant's tree is
 * unseeded by design (see routes/assistant.ts), so its memory doc is the first
 * thing that ever appears under it.
 */
const HEADING = "# What you remember about this user";

/**
 * Why the section says memories land on the NEXT chat: the system prompt is
 * frozen when the session is built, the same contract WORKSPACE.md ships
 * ("Edits take effect on the next chat.", workspace-context.ts).
 */
const TRAILER =
  "These are the things you have already learned about this user. Use them so " +
  "you never ask again for something they have told you before. This list is " +
  "fixed for the whole of this chat: whatever you remember from here on shows " +
  "up in it from the next chat onwards.";

/** Absolute path of an agent's learnings doc: <cwd>/.houston/learnings/learnings.json */
export function learningsDocPath(cwd: string): string {
  return join(cwd, ".houston", "learnings", "learnings.json");
}

/** The agent's saved learnings; [] when the file is absent, unreadable, or malformed. */
export function loadAgentLearnings(cwd: string): Learning[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(learningsDocPath(cwd), "utf8"));
  } catch {
    // Memory the prompt cannot read is treated as empty rather than failing the
    // whole session start — the read is retried on the next chat, and the
    // learnings routes surface a mangled doc to the user on their own path.
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isLearning);
}

/** True when this agent root is the user's personal assistant (basename === ASSISTANT_AGENT_NAME). */
export function isAssistantWorkspace(cwd: string): boolean {
  return basename(cwd) === ASSISTANT_AGENT_NAME;
}

/** The "# What you remember about this user" prompt section, or null. */
export function buildLearningsSection(cwd: string): string | null {
  if (!isAssistantWorkspace(cwd)) return null;
  const bullets = loadAgentLearnings(cwd)
    .map((learning) => learning.text.trim())
    .filter((text) => text.length > 0);
  if (!bullets.length) return null;
  return [HEADING, "", ...bullets.map((text) => `- ${text}`), "", TRAILER].join(
    "\n",
  );
}

/** The same shape `normalizeLearnings` keeps: an object with string id + text. */
function isLearning(entry: unknown): entry is Learning {
  if (typeof entry !== "object" || entry === null) return false;
  const record = entry as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.text === "string";
}
