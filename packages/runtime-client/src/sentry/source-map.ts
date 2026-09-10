import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type GeneratedPosition,
  type OriginalPosition,
  scanMappings,
} from "./mappings-scan";

export type { GeneratedPosition, OriginalPosition } from "./mappings-scan";

/**
 * On-demand reader for the `.map` esbuild writes beside each engine bundle
 * (`dist/<host|runtime>/main.mjs.map`), used by the Sentry reporter to turn
 * bundle offsets back into `.ts` locations (see map-frames.ts).
 *
 * Why neither `node --enable-source-maps` nor a decoder library: both decode
 * EVERY segment of the map into JS arrays up front and keep them for the life
 * of the process. Measured on the Node 22 image against the production maps
 * (mappings only): +163 MB RSS on the host and +200 MB on the runtime, the
 * same whether Node or `@jridgewell/trace-mapping` did the decoding. Errors
 * are rare, so this keeps only the `mappings` string (6-8 MB) plus the
 * resolved source paths and walks the string per lookup — a linear VLQ scan
 * (~30 ms for a position near the end of the runtime bundle) that allocates
 * nothing per segment. Total retained cost is ~25 MB per process.
 */

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

/**
 * Byte range of the `mappings` string value inside a compact (esbuild-style)
 * map, or undefined for anything else — a pretty-printed map, or a value
 * with an escape in it — which then takes the plain `JSON.parse` path.
 * VLQ mappings are base64 plus `,` and `;`, so the first `"` after the
 * opening one closes the value unless a `\` precedes it.
 */
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

  /**
   * Read `<bundlePath>.map`. Returns undefined when the file is missing,
   * unreadable, or not a v3 map — a crash reporter must never throw.
   *
   * The `mappings` value is sliced straight out of the file bytes rather
   * than parsed: `JSON.parse` over the whole 6-8 MB map builds a graph V8
   * frees but keeps as resident heap, ~30 MB of RSS for one call. Only the
   * small remainder (version, sources, names) goes through the parser.
   */
  static load(bundlePath: string): BundleSourceMap | undefined {
    const mapPath = `${bundlePath}.map`;
    try {
      const raw = readFileSync(mapPath);
      const split = splitMappings(raw);
      // `start` sits after the opening quote and `end` on the closing one,
      // so head + tail is the same document with an empty `mappings`.
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

  /** See `scanMappings`: one pass per batch, Node's `findOrigin` rule. */
  lookup(
    needles: readonly GeneratedPosition[],
  ): (OriginalPosition | undefined)[] {
    return scanMappings(this.mappings, this.sources, needles);
  }
}
