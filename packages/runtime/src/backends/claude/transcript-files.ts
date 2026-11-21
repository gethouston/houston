import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export function sdkProjectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function locateTranscript(
  projectsDir: string,
  sessionId: string,
): string | undefined {
  if (!existsSync(projectsDir)) return undefined;
  const file = `${sessionId}.jsonl`;
  const top = join(projectsDir, file);
  const candidates = existsSync(top) ? [top] : [];
  for (const entry of readdirSync(projectsDir)) {
    const nested = join(projectsDir, entry, file);
    if (existsSync(nested)) candidates.push(nested);
  }
  return candidates
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort(
      (left, right) =>
        right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path),
    )[0]?.path;
}

export function removeTranscript(projectsDir: string, sessionId: string): void {
  if (!existsSync(projectsDir)) return;
  const file = `${sessionId}.jsonl`;
  rmSync(join(projectsDir, file), { force: true });
  for (const entry of readdirSync(projectsDir)) {
    rmSync(join(projectsDir, entry, file), { force: true });
  }
}
