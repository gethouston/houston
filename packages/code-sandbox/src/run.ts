import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectArtifacts } from "./artifacts";
import { runProcess } from "./exec";
import { safeJoin } from "./paths";
import {
  DEFAULT_LIMITS,
  isLanguage,
  type Language,
  type Limits,
  type RunRequest,
  type RunResult,
} from "./types";

export { safeJoin } from "./paths";
export type {
  Artifact,
  InputFile,
  Language,
  Limits,
  RunRequest,
  RunResult,
} from "./types";
// Public surface re-exported so callers import everything from "./run".
export { DEFAULT_LIMITS, isLanguage, LANGUAGES } from "./types";

/**
 * The code-execution core. Its only side effect is a temp directory it ALWAYS
 * cleans up, so it is unit-testable without the HTTP layer.
 *
 * Threat model: `code` is UNTRUSTED (an AI agent wrote it, possibly under prompt
 * injection). The kernel/tenant wall is Cloud Run's per-instance microVM; this
 * function's job is the in-instance hygiene that makes a warm instance safe to
 * reuse for the next tenant: a brand-new working directory per run (removed in
 * `finally`, so request N+1 can't see request N's files), a minimal non-secret
 * environment, hard timeouts that reap the whole process group, and output +
 * artifact caps.
 */

const PROGRAM_FILE: Record<Language, string> = {
  python: "__houston_main__.py",
  bash: "__houston_main__.sh",
  node: "__houston_main__.mjs",
};

export async function runInSandbox(
  req: RunRequest,
  limits: Limits = DEFAULT_LIMITS,
): Promise<RunResult> {
  if (!isLanguage(req.language))
    throw new Error(`unsupported language: ${String(req.language)}`);
  if (typeof req.code !== "string") throw new Error("missing 'code' (string)");
  const files = req.files ?? [];
  if (files.length > limits.maxInputFiles) {
    throw new Error(
      `too many input files: ${files.length} (max ${limits.maxInputFiles})`,
    );
  }
  const timeoutMs = Math.min(
    Math.max(1, req.timeoutMs ?? limits.defaultTimeoutMs),
    limits.maxTimeoutMs,
  );

  const work = await mkdtemp(join(tmpdir(), "houston-sbx-"));
  const programPath = join(work, PROGRAM_FILE[req.language]);
  // Remember seeded inputs so we don't echo unchanged uploads back as "artifacts".
  const seeded = new Map<string, number>();
  try {
    for (const f of files) {
      if (typeof f?.path !== "string" || typeof f?.contentBase64 !== "string") {
        throw new Error("each input file needs { path, contentBase64 }");
      }
      const abs = safeJoin(work, f.path);
      const buf = Buffer.from(f.contentBase64, "base64");
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, buf);
      seeded.set(abs, buf.byteLength);
    }
    await writeFile(programPath, req.code, "utf8");

    const started = Date.now();
    const exec = await runProcess(
      req.language,
      programPath,
      work,
      timeoutMs,
      limits.maxOutputBytes,
    );
    const durationMs = Date.now() - started;

    const { artifacts, dropped } = await collectArtifacts(
      work,
      programPath,
      seeded,
      limits.maxArtifactBytes,
    );
    return { ...exec, artifacts, droppedArtifacts: dropped, durationMs };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
