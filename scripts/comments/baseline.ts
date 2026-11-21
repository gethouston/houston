import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRepoFile, repoRoot, scopedFiles } from "./files.ts";
import type { Comment, Config } from "./model.ts";
import { scanSource } from "./scan.ts";

export type Counts = Record<string, number>;

export interface Drift {
  file: string;
  count: number;
  allowed: number;
}

export const baselineFile = join(repoRoot, "scripts/comments/baseline.json");

export function readBaseline(): Counts | null {
  if (!existsSync(baselineFile)) return null;
  return JSON.parse(readFileSync(baselineFile, "utf8"));
}

export function sortedCounts(counts: Counts): Counts {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function renderBaseline(counts: Counts): string {
  return `${JSON.stringify(sortedCounts(counts), null, 2)}\n`;
}

export function writeBaseline(counts: Counts): void {
  writeFileSync(baselineFile, renderBaseline(counts));
}

export interface Scan {
  file: string;
  comments: Comment[];
}

export function scanAll(
  config: Config,
  prefixes: readonly string[] = [],
): { scans: Scan[]; failures: string[] } {
  const scans: Scan[] = [];
  const failures: string[] = [];
  for (const file of scopedFiles(config, prefixes)) {
    try {
      scans.push({
        file,
        comments: scanSource(file, readRepoFile(file), config.pinned),
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { scans, failures };
}

export function proseCounts(scans: readonly Scan[]): Counts {
  const counts: Counts = {};
  for (const { file, comments } of scans) {
    const prose = comments.filter((comment) => !comment.tooling).length;
    if (prose > 0) counts[file] = prose;
  }
  return counts;
}

export function compareBaseline(
  current: Counts,
  baseline: Counts,
): { over: Drift[]; under: Drift[] } {
  const files = [
    ...new Set([...Object.keys(current), ...Object.keys(baseline)]),
  ].sort();
  const over: Drift[] = [];
  const under: Drift[] = [];
  for (const file of files) {
    const count = current[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (count > allowed) over.push({ file, count, allowed });
    if (count < allowed) under.push({ file, count, allowed });
  }
  return { over, under };
}

export function ratchetBaseline(
  current: Counts,
  baseline: Counts,
): { next: Counts; raised: Drift[] } {
  return {
    next: sortedCounts(current),
    raised: compareBaseline(current, baseline).over,
  };
}
