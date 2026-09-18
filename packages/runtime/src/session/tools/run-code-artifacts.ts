import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

/**
 * Artifact write-back for `run_code`, kept apart from the tool itself.
 *
 * Collision-safe by construction: an artifact may only OVERWRITE a workspace
 * file the model explicitly declared via input_files (it asked to transform
 * that file); any other collision is saved under a new name and reported.
 * Untrusted sandbox code must never silently destroy user files.
 */

export interface SandboxArtifact {
  path: string;
  contentBase64: string;
}

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  artifacts: SandboxArtifact[];
  droppedArtifacts?: string[];
}

export interface SavedArtifacts {
  saved: string[];
  updated: string[];
  renamed: { requested: string; savedAs: string }[];
  skipped: string[];
}

/** Resolve a workspace-relative path strictly inside the workspace; reject escapes. */
export function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes the workspace: ${rel}`);
  }
  return abs;
}

/** First "name (2).ext"-style path that does not exist yet. */
function nonColliding(abs: string): string {
  const dir = dirname(abs);
  const ext = extname(abs);
  const stem = basename(abs, ext);
  for (let i = 2; i < 1000; i++) {
    const candidate = join(dir, `${stem} (${i})${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`too many name collisions for ${abs}`);
}

/**
 * Persist every artifact. One bad path must not discard the others; a collision
 * with an UNDECLARED workspace file is renamed, not overwritten. Everything is
 * reported back to the model — nothing is dropped silently.
 */
export async function saveArtifacts(
  workspaceDir: string,
  artifacts: SandboxArtifact[],
  declared: Set<string>,
): Promise<SavedArtifacts> {
  const out: SavedArtifacts = {
    saved: [],
    updated: [],
    renamed: [],
    skipped: [],
  };
  for (const a of artifacts) {
    try {
      let abs = safeJoin(workspaceDir, a.path);
      const collided = existsSync(abs) && !declared.has(abs);
      if (collided) abs = nonColliding(abs);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, Buffer.from(a.contentBase64, "base64"));
      const rel = relative(workspaceDir, abs);
      if (collided) out.renamed.push({ requested: a.path, savedAs: rel });
      else if (declared.has(abs)) out.updated.push(rel);
      else out.saved.push(rel);
    } catch {
      out.skipped.push(a.path);
    }
  }
  return out;
}

/** The model-facing summary of one run: output, then everything that happened to files. */
export function summarizeRun(
  result: SandboxResult,
  files: SavedArtifacts,
): string {
  const parts: string[] = [];
  if (result.stdout?.trim()) parts.push(result.stdout.trimEnd());
  if (result.stderr?.trim()) {
    // A clean exit that still wrote to stderr is warnings, not errors.
    parts.push(
      `${result.exitCode === 0 ? "[warnings]" : "[errors]"}\n${result.stderr.trimEnd()}`,
    );
  }
  if (result.truncated) parts.push("[output was truncated to the size limit]");
  if (result.timedOut)
    parts.push("[the program hit the time limit and was stopped]");
  if (files.saved.length)
    parts.push(`[saved files: ${files.saved.join(", ")}]`);
  if (files.updated.length)
    parts.push(`[updated input files: ${files.updated.join(", ")}]`);
  for (const r of files.renamed) {
    parts.push(
      `[${r.requested} already existed and was not an input file; saved as: ${r.savedAs}]`,
    );
  }
  if (files.skipped.length)
    parts.push(`[could not save (invalid path): ${files.skipped.join(", ")}]`);
  if (result.droppedArtifacts?.length) {
    parts.push(
      `[these files were produced but too large to return: ${result.droppedArtifacts.join(", ")}]`,
    );
  }
  if (
    typeof result.exitCode === "number" &&
    result.exitCode !== 0 &&
    !result.timedOut
  ) {
    parts.push(`[exit code ${result.exitCode}]`);
  }
  return parts.join("\n\n") || "(the program produced no output)";
}
