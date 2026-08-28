import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  type CreateAgentSessionOptions,
  createAgentSession,
  type ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { makeAgentLoader } from "../../session/resource-loader";
import { toolNamesForMode } from "../../session/tool-selection";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../types";
import { PiSession } from "./session";

/**
 * Everything the pi backend needs. The SAME factory serves both call sites: the
 * long-lived server (module-level auth/registry/tools, one workspace) and the
 * per-request cloud runtime (throwaway dirs, per-turn auth/registry/tools). Only
 * the wiring differs — the caller builds the tools and passes them through here.
 */
export interface PiBackendDeps {
  workspaceDir: string;
  dataDir: string;
  modelRuntime: ModelRuntime;
  /** Active built-in tool names (pi's tool allowlist). */
  tools: NonNullable<CreateAgentSessionOptions["tools"]>;
  /** SDK custom tools (clamped fs, run-code, integrations). */
  customTools: NonNullable<CreateAgentSessionOptions["customTools"]>;
}

/**
 * Build the pi HarnessBackend. `createSession` rehydrates this conversation's pi
 * session if one is on disk, else starts fresh: `continueRecent()` reopens the
 * most recent session in the conversation's dedicated dir, and
 * `createAgentSession` rehydrates the agent's message history from it (SDK:
 * hasExistingSession → agent.state.messages). `create()` would mint a brand-new
 * empty session every time, so a fresh process (runtime restart, or a cloud
 * sandbox woken from sleep) would silently lose all prior turns.
 */
/**
 * Reopen the conversation's NEWEST session file, wherever it was written.
 *
 * `SessionManager.continueRecent` filters candidates by the cwd recorded in
 * each session header. On a standing pod the workspace path never changes, so
 * that filter is a no-op — but a pool worker hydrates the agent into a fresh
 * temp root for every turn, so no prior header can ever match and every turn
 * silently started a BLANK session: the model answered with no memory of the
 * conversation while the transcript looked complete everywhere else. The
 * sessions/<conversationId>/ dir is per-conversation by construction — every
 * file in it belongs to this conversation — so the newest file is the one to
 * resume, no cwd questions asked, opened AT this turn's workspace path.
 *
 * Newest by FILENAME: pi names session files with an ISO-timestamp prefix,
 * which sorts chronologically; mtimes would lie here (hydration rewrites
 * them in download order).
 */
export function resumeSessionManager(
  workspaceDir: string,
  sessionDir: string,
  fresh: boolean,
): SessionManager {
  if (!fresh) {
    const newest = newestSessionFile(sessionDir);
    if (newest) return SessionManager.open(newest, sessionDir, workspaceDir);
  }
  return SessionManager.create(workspaceDir, sessionDir);
}

function newestSessionFile(sessionDir: string): string | null {
  let files: string[];
  try {
    files = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
  } catch (err) {
    // ONLY a missing dir means "no sessions yet". Anything else (EIO,
    // EACCES, fd exhaustion) must fail the turn loudly — swallowing it
    // would answer with silent amnesia, the exact bug this helper ends.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  files.sort();
  // Newest → oldest, skipping anything that is not a readable pi session
  // (a zero-byte file left by a crash mid-write, junk): opening a corrupt
  // "newest" would rewrite it as a BLANK session and silently discard the
  // conversation's context — the exact failure this helper exists to end.
  for (let i = files.length - 1; i >= 0; i--) {
    const candidate = join(sessionDir, files[i] as string);
    if (isReadableSession(candidate)) return candidate;
  }
  return null;
}

/** Whether a present hydrated Pi tail is corrupt and cannot be resumed. */
export function hasUnreadablePiSessionTail(sessionDir: string): boolean {
  let hasSessionFile = false;
  try {
    hasSessionFile = readdirSync(sessionDir).some((file) =>
      file.endsWith(".jsonl"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return hasSessionFile && newestSessionFile(sessionDir) === null;
}

function isReadableSession(file: string): boolean {
  // Bounded: only the header line matters, and session files grow to MBs.
  const buffer = Buffer.alloc(64 * 1024);
  let descriptor: number;
  try {
    descriptor = openSync(file, "r");
  } catch {
    return false;
  }
  try {
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    const head = buffer.toString("utf8", 0, bytes).split("\n", 1)[0] as string;
    if (!head) return false;
    const parsed = JSON.parse(head) as { type?: unknown };
    return parsed.type === "session";
  } catch {
    return false;
  } finally {
    closeSync(descriptor);
  }
}

export function createPiBackend(deps: PiBackendDeps): HarnessBackend {
  return {
    id: "pi",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      // The turn's mode overlays its prompt (via the loader) and clamps the
      // allowlist through `toolNamesForMode`: plan → the read-only subset, auto →
      // everything minus ask_user (the one blocking tool),
      // execute → unchanged. The customTools list is UNCHANGED — pi gates its
      // custom tools by the `tools` name allowlist, so filtering the names here
      // drops the excluded tools from the model's reach without rebuilding the
      // tool objects. Workspace + user context (opts.context) rides alongside.
      const loader = makeAgentLoader(
        deps.workspaceDir,
        opts.mode,
        opts.context,
      );
      await loader.reload();
      const { session } = await createAgentSession({
        cwd: deps.workspaceDir,
        agentDir: deps.dataDir,
        model: opts.model as unknown as Model<Api>,
        ...(opts.thinkingLevel ? { thinkingLevel: opts.thinkingLevel } : {}),
        modelRuntime: deps.modelRuntime,
        // A cross-backend rebuild (opts.fresh) mints a NEW session file in the
        // conversation's dir instead of reopening the most recent one: the
        // history arrives as a transcript replay on the first prompt (HOU-951),
        // and a conversation returning to pi after a Claude era must not resume
        // its stale pre-switch session on top of that replay.
        sessionManager: resumeSessionManager(
          deps.workspaceDir,
          join(deps.dataDir, "sessions", opts.conversationId),
          opts.fresh === true,
        ),
        resourceLoader: loader,
        tools: toolNamesForMode(opts.mode, deps.tools),
        customTools: deps.customTools,
      });
      return new PiSession(session);
    },
  };
}
