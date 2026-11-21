import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  appendAssistantMessageAt,
  loadConversation,
} from "../store/conversation-file";
import { reportMissionSettle } from "./mission-settle";
import { type ResumeRequest, resumeRequestFor } from "./resume-request";
import {
  clearInflightMarker,
  type InflightTurnMarker,
  listInflightMarkers,
} from "./turn-inflight-marker";

export class EngineRestartedMidTurnError extends Error {
  constructor(
    readonly marker: InflightTurnMarker,
    readonly ranForMs: number,
    readonly footprint: TurnFootprint = { transcriptBytes: 0, sessionBytes: 0 },
  ) {
    super(
      `engine restarted mid-turn: conversation=${marker.conversationId} turn=${marker.turnId} ran=${Math.round(ranForMs / 1000)}s tool=${marker.tool ?? "none"} fenced=${marker.fenced} transcript=${mib(footprint.transcriptBytes)} session=${mib(footprint.sessionBytes)}${fenceBypassed(marker) ? " (bash ran under the memory fence and the engine still died)" : ""}`,
    );
    this.name = "EngineRestartedMidTurnError";
  }
}

export interface TurnFootprint {
  transcriptBytes: number;
  sessionBytes: number;
}

export function turnFootprint(
  dataDir: string,
  conversationId: string,
): TurnFootprint {
  const key = encodeURIComponent(conversationId);
  return {
    transcriptBytes: sizeOf(join(dataDir, "conversations", `${key}.json`)),
    sessionBytes: dirBytes(join(dataDir, "sessions", conversationId), ".jsonl"),
  };
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

function dirBytes(dir: string, suffix: string): number {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  return names
    .filter((n) => n.endsWith(suffix))
    .reduce((sum, n) => sum + sizeOf(join(dir, n)), 0);
}

const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MiB`;

export function fenceBypassed(marker: InflightTurnMarker): boolean {
  return marker.fenced && marker.tool !== undefined && isShellTool(marker.tool);
}

const SHELL_TOOLS = new Set(["bash", "Bash"]);

function isShellTool(name: string): boolean {
  return SHELL_TOOLS.has(name);
}

export interface SettleInterruptedTurnsOptions {
  dataDir: string;
  report?: (error: EngineRestartedMidTurnError) => void;
  settleMission?: (conversationId: string, turnId: string) => void;
  now?: () => number;
}

export interface SettledInterruptedTurns {
  settled: InflightTurnMarker[];
  resumable: ResumeRequest[];
}

export function settleInterruptedTurns(
  opts: SettleInterruptedTurnsOptions,
): SettledInterruptedTurns {
  const report =
    opts.report ??
    ((error: EngineRestartedMidTurnError) =>
      console.error("[turn] engine restarted mid-turn", error));
  const settleMission =
    opts.settleMission ??
    ((conversationId: string, turnId: string) =>
      reportMissionSettle(conversationId, "error", null, turnId, false));
  const now = opts.now ?? Date.now;
  const conversationsDir = join(opts.dataDir, "conversations");
  const settled: InflightTurnMarker[] = [];
  const resumable: ResumeRequest[] = [];
  for (const marker of listInflightMarkers(opts.dataDir)) {
    if (alreadySettled(conversationsDir, marker)) {
      clearInflightMarker(opts.dataDir, marker.conversationId);
      continue;
    }
    const resume = resumeRequestFor(conversationsDir, marker, now());
    appendAssistantMessageAt(conversationsDir, marker.conversationId, "", {
      interrupted: {
        cause: "engine_restart",
        ...(marker.tool !== undefined ? { tool: marker.tool } : {}),
        ...(resume ? { resumed: true } : {}),
      },
      turnId: marker.turnId,
    });
    if (resume) resumable.push(resume);
    if (!resume) settleMission(marker.conversationId, marker.turnId);
    report(
      new EngineRestartedMidTurnError(
        marker,
        Math.max(0, now() - marker.startedAt),
        turnFootprint(opts.dataDir, marker.conversationId),
      ),
    );
    clearInflightMarker(opts.dataDir, marker.conversationId);
    settled.push(marker);
  }
  return { settled, resumable };
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
