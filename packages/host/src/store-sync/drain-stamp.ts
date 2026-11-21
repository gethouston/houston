import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DRAIN_STAMP_FILE = ".houston-drain.json";

export interface DrainStamp {
  since: number;
  until: number;
}

export function drainStampPath(rootDir: string): string {
  return join(rootDir, DRAIN_STAMP_FILE);
}

export async function writeDrainStamp(
  rootDir: string,
  stamp: DrainStamp,
): Promise<void> {
  await writeFile(drainStampPath(rootDir), JSON.stringify(stamp), "utf8");
}

export async function expireDrainStamp(
  rootDir: string,
  now: number,
): Promise<void> {
  let since = now;
  try {
    since = (await readDrainStampFile(drainStampPath(rootDir)))?.since ?? now;
  } catch {}
  await writeDrainStamp(rootDir, { since, until: now });
}

export async function readDrainStampFile(
  file: string,
): Promise<DrainStamp | undefined> {
  return parseDrainStamp(await readFile(file, "utf8"));
}

export function parseDrainStamp(text: string): DrainStamp | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { since, until } = parsed as Partial<DrainStamp>;
  if (typeof since !== "number" || !Number.isFinite(since)) return undefined;
  if (typeof until !== "number" || !Number.isFinite(until)) return undefined;
  return { since, until };
}
