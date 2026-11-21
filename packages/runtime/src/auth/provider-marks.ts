import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { config } from "../config";

export interface QuotaMark {
  fingerprint: string;
  expiresAt: number;
}

export interface ProviderMarks {
  authFailed: Map<string, string>;
  quotaExhausted: Map<string, QuotaMark>;
}

interface MarksFile {
  authFailed?: Record<string, unknown>;
  quotaExhausted?: Record<string, unknown>;
}

const MARKS_FILE = "provider-marks.json";

let cached: { path: string; marks: ProviderMarks } | null = null;

function marksPath(): string {
  return join(config.dataDir, MARKS_FILE);
}

function parseMarks(raw: string): ProviderMarks {
  const parsed = JSON.parse(raw) as MarksFile;
  const authFailed = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed.authFailed ?? {})) {
    if (typeof value === "string") authFailed.set(key, value);
  }
  const quotaExhausted = new Map<string, QuotaMark>();
  for (const [key, value] of Object.entries(parsed.quotaExhausted ?? {})) {
    const mark = value as Partial<QuotaMark> | null;
    if (
      typeof mark?.fingerprint === "string" &&
      typeof mark.expiresAt === "number"
    )
      quotaExhausted.set(key, {
        fingerprint: mark.fingerprint,
        expiresAt: mark.expiresAt,
      });
  }
  return { authFailed, quotaExhausted };
}

export function readProviderMarks(): ProviderMarks {
  const path = marksPath();
  if (cached?.path === path) return cached.marks;
  let marks: ProviderMarks = {
    authFailed: new Map(),
    quotaExhausted: new Map(),
  };
  try {
    marks = parseMarks(readFileSync(path, "utf8"));
  } catch {}
  cached = { path, marks };
  return marks;
}

export function writeProviderMarks(marks: ProviderMarks): void {
  const path = marksPath();
  cached = { path, marks };
  const body = JSON.stringify({
    authFailed: Object.fromEntries(marks.authFailed),
    quotaExhausted: Object.fromEntries(marks.quotaExhausted),
  });
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = atomicTempPath(path);
    writeFileSync(tmp, body);
    renameSync(tmp, path);
  } catch (err) {
    console.error("[provider-marks] could not persist provider marks:", err);
  }
}

export function forgetProviderMarks(): void {
  const path = marksPath();
  cached = null;
  rmSync(path, { force: true });
}
