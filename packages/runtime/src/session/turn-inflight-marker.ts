import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { parseTurnResumeInfo, type TurnResumeInfo } from "./turn-resume-info";

export interface InflightTurnMarker {
  conversationId: string;
  turnId: string;
  startedAt: number;
  tool?: string;
  fenced: boolean;
  resume?: TurnResumeInfo;
  resumeOf?: string;
}

// WHY: Keep out of conversations/; the lister reads every JSON there as a transcript. ADR-0012
export const INFLIGHT_DIR = join("turns", "inflight");

export function inflightDir(dataDir: string): string {
  return join(dataDir, INFLIGHT_DIR);
}

const fileFor = (dataDir: string, conversationId: string) =>
  join(inflightDir(dataDir), `${encodeURIComponent(conversationId)}.json`);

export function writeInflightMarker(
  dataDir: string,
  marker: InflightTurnMarker,
): void {
  const dir = inflightDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const file = fileFor(dataDir, marker.conversationId);
  const tmp = atomicTempPath(file);
  writeFileSync(tmp, JSON.stringify(marker));
  renameSync(tmp, file);
}

export function noteInflightTool(
  dataDir: string,
  conversationId: string,
  tool: string,
): void {
  const current = readInflightMarker(dataDir, conversationId);
  if (!current) return;
  writeInflightMarker(dataDir, { ...current, tool });
}

export function clearInflightMarker(
  dataDir: string,
  conversationId: string,
): void {
  rmSync(fileFor(dataDir, conversationId), { force: true });
}

export function readInflightMarker(
  dataDir: string,
  conversationId: string,
): InflightTurnMarker | null {
  return parseMarker(readOrNull(fileFor(dataDir, conversationId)));
}

export function listInflightMarkers(dataDir: string): InflightTurnMarker[] {
  const dir = inflightDir(dataDir);
  if (!existsSync(dir)) return [];
  const out: InflightTurnMarker[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(dir, name);
    const marker = parseMarker(readOrNull(file));
    if (marker) out.push(marker);
    else rmSync(file, { force: true });
  }
  return out;
}

function parseMarker(raw: string | null): InflightTurnMarker | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const m = value as Partial<InflightTurnMarker>;
  if (
    typeof m.conversationId !== "string" ||
    typeof m.turnId !== "string" ||
    typeof m.startedAt !== "number"
  )
    return null;
  const resume = parseTurnResumeInfo(m.resume);
  return {
    conversationId: m.conversationId,
    turnId: m.turnId,
    startedAt: m.startedAt,
    ...(typeof m.tool === "string" ? { tool: m.tool } : {}),
    fenced: m.fenced === true,
    ...(resume ? { resume } : {}),
    ...(typeof m.resumeOf === "string" ? { resumeOf: m.resumeOf } : {}),
  };
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
