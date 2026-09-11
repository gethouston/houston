import { join } from "node:path";
import {
  appendAssistantMessageAt,
  loadConversation,
} from "../store/conversation-file";
import { reportMissionSettle } from "./mission-settle";
import {
  clearInflightMarker,
  type InflightTurnMarker,
  listInflightMarkers,
} from "./turn-inflight-marker";

/**
 * Boot-time settle of the turns the previous process died on (see
 * turn-inflight-marker.ts). For each survivor: persist the reply the dead
 * process never wrote — empty content, `interrupted` set — so a client that
 * reconnects (settle-from-history) or reloads (history replay) renders the
 * authored restart line instead of the generic dead-turn copy; report the
 * restart once, with the marker's fields, so Sentry can count them fleet-wide;
 * then drop the marker so the next boot is quiet. Runs BEFORE the server
 * listens: a client that reconnects the instant the engine is back must find
 * the reply already on disk.
 *
 * Cause inference: a marker survives only an UNCLEAN exit — every in-process
 * end of a turn clears it, and a drained shutdown lets the turn end first. So
 * "marker present at boot" IS "the process was killed mid-turn"; on a managed
 * pod that is the group OOM kill or an involuntary eviction.
 */

/**
 * The name Sentry titles the issue by — one issue for every restart, the
 * marker's fields in the message and extras. Never merged into a generic
 * `[turn]` bucket: the count is the point.
 */
export class EngineRestartedMidTurnError extends Error {
  constructor(
    readonly marker: InflightTurnMarker,
    readonly ranForMs: number,
  ) {
    super(
      `engine restarted mid-turn: conversation=${marker.conversationId} turn=${marker.turnId} ran=${Math.round(ranForMs / 1000)}s tool=${marker.tool ?? "none"} fenced=${marker.fenced}${fenceBypassed(marker) ? " (bash ran under the memory fence and the engine still died)" : ""}`,
    );
    this.name = "EngineRestartedMidTurnError";
  }
}

/**
 * Whether the fence should have caught this: a shell tool was running and the
 * cap was on. Any other survivor (no tool, a non-shell tool, no fence) is a
 * kill the fence never claimed to prevent.
 */
export function fenceBypassed(marker: InflightTurnMarker): boolean {
  return marker.fenced && marker.tool !== undefined && isShellTool(marker.tool);
}

// pi registers its shell as `bash`; the Claude CLI names its tool `Bash`.
const SHELL_TOOLS = new Set(["bash", "Bash"]);

function isShellTool(name: string): boolean {
  return SHELL_TOOLS.has(name);
}

export interface SettleInterruptedTurnsOptions {
  dataDir: string;
  /** Test seam; defaults to the console error the Sentry capture feeds on. */
  report?: (error: EngineRestartedMidTurnError) => void;
  /** Test seam; defaults to the control-plane mission settle. */
  settleMission?: (conversationId: string) => void;
  now?: () => number;
}

/** Returns the settled markers (the report count), in directory order. */
export function settleInterruptedTurns(
  opts: SettleInterruptedTurnsOptions,
): InflightTurnMarker[] {
  const report =
    opts.report ??
    ((error: EngineRestartedMidTurnError) =>
      console.error("[turn] engine restarted mid-turn", error));
  const settleMission =
    opts.settleMission ??
    ((conversationId: string) =>
      reportMissionSettle(conversationId, "error", null));
  const now = opts.now ?? Date.now;
  const conversationsDir = join(opts.dataDir, "conversations");
  const settled: InflightTurnMarker[] = [];
  for (const marker of listInflightMarkers(opts.dataDir)) {
    // A marker for a turn this conversation already carries an interrupted
    // reply for is a re-delivery, not a second death: on a managed pod the
    // replacement boots while the evicted pod is still draining the turn, and
    // that pod's store sync re-ships the marker the replacement just cleared.
    // The next boot found it again and wrote a second "had to restart" line
    // for the one turn (PRODUCT-1778). Drop the marker, settle nothing twice.
    if (alreadySettled(conversationsDir, marker)) {
      clearInflightMarker(opts.dataDir, marker.conversationId);
      continue;
    }
    // The reply first, the marker last: a crash between the two re-settles
    // (a second `interrupted` reply) rather than losing the settle. A missing
    // conversation (deleted while the turn ran) has nothing to settle into;
    // appendAssistantMessageAt is a no-op on it and the marker still clears.
    appendAssistantMessageAt(conversationsDir, marker.conversationId, "", {
      interrupted: {
        cause: "engine_restart",
        ...(marker.tool !== undefined ? { tool: marker.tool } : {}),
      },
      turnId: marker.turnId,
    });
    // An agent-started mission has no client to settle its card from the
    // reply; the runtime reports its terminal state exactly as a thrown turn
    // does (mission-settle.ts). Fire-and-forget there, never boot-fatal here.
    settleMission(marker.conversationId);
    report(
      new EngineRestartedMidTurnError(
        marker,
        Math.max(0, now() - marker.startedAt),
      ),
    );
    clearInflightMarker(opts.dataDir, marker.conversationId);
    settled.push(marker);
  }
  return settled;
}

function alreadySettled(
  conversationsDir: string,
  marker: InflightTurnMarker,
): boolean {
  const conv = loadConversation(conversationsDir, marker.conversationId);
  return (
    conv?.messages.some(
      (m) =>
        m.role === "assistant" &&
        m.turnId === marker.turnId &&
        m.interrupted !== undefined,
    ) ?? false
  );
}
