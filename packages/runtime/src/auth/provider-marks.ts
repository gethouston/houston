import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config";

/**
 * Disk backing for the turn-time provider marks (credential-health.ts): which
 * credential failed authentication, and which one ran out of quota.
 *
 * The marks are DERIVED state, not credential material — each one is a
 * fingerprint (a sha256 of the stored credential) plus an expiry, never a
 * token. They are persisted because a pod restart would otherwise report a
 * dead token as Connected until the next failing turn (PRODUCT-1475), and a
 * routine firing in that window fails with a lie on screen.
 *
 * Persisting "broken" state is only safe because every mark carries the
 * fingerprint of the credential it was recorded against: a re-login, a pasted
 * key, a fresh served token or an endpoint change all move the fingerprint, so
 * a loaded mark auto-heals the moment the credential differs. No out-of-band
 * fix can be wedged off by a stale file.
 */

/** A quota mark: the credential it applies to, and when it lapses (epoch ms). */
export interface QuotaMark {
  fingerprint: string;
  expiresAt: number;
}

export interface ProviderMarks {
  /** `${scopeKey}:${provider}` → fingerprint of the credential that failed auth. */
  authFailed: Map<string, string>;
  /** `${scopeKey}:${provider}` → the account's exhausted-quota mark. */
  quotaExhausted: Map<string, QuotaMark>;
}

interface MarksFile {
  authFailed?: Record<string, unknown>;
  quotaExhausted?: Record<string, unknown>;
}

const MARKS_FILE = "provider-marks.json";

// Keyed by the resolved path, not loaded once per process: tests (and the
// per-turn layout) repoint `config.dataDir`, and a path change must re-read.
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

/** The marks on disk, loaded once per data dir. Missing or garbled → empty. */
export function readProviderMarks(): ProviderMarks {
  const path = marksPath();
  if (cached?.path === path) return cached.marks;
  let marks: ProviderMarks = {
    authFailed: new Map(),
    quotaExhausted: new Map(),
  };
  try {
    marks = parseMarks(readFileSync(path, "utf8"));
  } catch {
    // Absent on first run; garbled means a half-written file from a killed
    // process. Both mean "nothing is known" — the next turn re-learns it.
  }
  cached = { path, marks };
  return marks;
}

/** Write the in-memory marks through to disk. */
export function writeProviderMarks(marks: ProviderMarks): void {
  const path = marksPath();
  cached = { path, marks };
  const body = JSON.stringify({
    authFailed: Object.fromEntries(marks.authFailed),
    quotaExhausted: Object.fromEntries(marks.quotaExhausted),
  });
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, body);
    renameSync(tmp, path);
  } catch (err) {
    // The mark still holds in memory for this process, so status stays honest
    // until a restart; a read-only/full data dir must not break the turn that
    // was classifying an error when it happened.
    console.error("[provider-marks] could not persist provider marks:", err);
  }
}

/** Tests only: forget every mark, in memory and on disk. */
export function forgetProviderMarks(): void {
  const path = marksPath();
  cached = null;
  rmSync(path, { force: true });
}
