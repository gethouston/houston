import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type GeneratedPosition,
  type OriginalPosition,
  scanMappings,
} from "./mappings-scan";

export type { GeneratedPosition, OriginalPosition } from "./mappings-scan";

interface EncodedSourceMap {
  version: 3;
  sources: (string | null)[];
  sourceRoot?: string;
  mappings: string;
}

function isEncodedSourceMap(value: unknown): value is EncodedSourceMap {
  if (typeof value !== "object" || value === null) return false;
  const map = value as Partial<EncodedSourceMap>;
  return (
    map.version === 3 &&
    typeof map.mappings === "string" &&
    Array.isArray(map.sources)
  );
}

function resolveSource(
  mapDir: string,
  sourceRoot: string | undefined,
  source: string,
): string {
  if (source.startsWith("file://")) return fileURLToPath(source);
  if (isAbsolute(source)) return source;
  return resolve(mapDir, sourceRoot ?? "", source);
}

const MAPPINGS_KEY = '"mappings":"';

function splitMappings(
  raw: Buffer,
): { start: number; end: number } | undefined {
  const key = raw.indexOf(MAPPINGS_KEY);
  if (key < 0) return undefined;
  const start = key + MAPPINGS_KEY.length;
  const end = raw.indexOf('"', start);
  if (end < 0) return undefined;
  const backslash = raw.indexOf("\\", start);
  if (backslash >= 0 && backslash < end) return undefined;
  return { start, end };
}

export class BundleSourceMap {
  private readonly mappings: string;
  private readonly sources: readonly (string | null)[];
  private constructor(mappings: string, sources: readonly (string | null)[]) {
    this.mappings = mappings;
    this.sources = sources;
  }

  static load(bundlePath: string): BundleSourceMap | undefined {
    const mapPath = `${bundlePath}.map`;
    try {
      const raw = readFileSync(mapPath);
      const split = splitMappings(raw);
      const parsed: unknown = JSON.parse(
        split
          ? raw.toString("utf8", 0, split.start) +
              raw.toString("utf8", split.end)
          : raw.toString("utf8"),
      );
      if (!isEncodedSourceMap(parsed)) return undefined;
      const mappings = split
        ? raw.toString("latin1", split.start, split.end)
        : parsed.mappings;
      const mapDir = dirname(mapPath);
      const sources = parsed.sources.map((source) =>
        source === null
          ? null
          : resolveSource(mapDir, parsed.sourceRoot, source),
      );
      return new BundleSourceMap(mappings, sources);
    } catch {
      return undefined;
    }
  }

  lookup(
    needles: readonly GeneratedPosition[],
  ): (OriginalPosition | undefined)[] {
    return scanMappings(this.mappings, this.sources, needles);
  }
}
