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
export { DEFAULT_LIMITS, isLanguage, LANGUAGES } from "./types";

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
