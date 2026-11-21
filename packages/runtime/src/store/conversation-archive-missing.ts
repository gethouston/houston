import { LruCache } from "../lru";

export type MissingSegment = "report" | "throw";

export class ArchiveSegmentMissingError extends Error {
  constructor(readonly file: string) {
    super(`archive segment missing: ${file}`);
    this.name = "ArchiveSegmentMissingError";
  }
}

const reported = new LruCache<string, true>({ capacity: 512 });

export function reportMissingSegment(file: string): ArchiveSegmentMissingError {
  const error = new ArchiveSegmentMissingError(file);
  if (!reported.get(file)) {
    reported.set(file, true);
    console.error("[conversations] archive segment missing", error);
  }
  return error;
}
