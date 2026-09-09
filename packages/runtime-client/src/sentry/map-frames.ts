import { resolve } from "node:path";
import type { Event, StackFrame } from "@sentry/core";
import { stackHolders } from "./frames";
import {
  BundleSourceMap,
  type GeneratedPosition,
  type OriginalPosition,
} from "./source-map";

/**
 * Event processor that rewrites frames pointing at the running esbuild bundle
 * (`dist/<host|runtime>/main.mjs`) to their original `.ts` file, line and
 * column, using the sibling `.map` — loaded on the first event that needs it,
 * never at boot. Node itself runs WITHOUT `--enable-source-maps` (see
 * source-map.ts for the memory reason), so this is the only place bundle
 * offsets become source locations. It runs before `trimReporterFrames` and
 * `addSourceContext`, which both key on the mapped filenames.
 *
 * A missing or unparsable map leaves frames at their bundle offsets; nothing
 * here throws.
 */

/**
 * The bundle this process is running, if it is one: Node resolves argv[1] to
 * an absolute path, which is exactly what V8 prints in `file://` stack frames
 * (Sentry's node parser strips the scheme). The Bun-compiled desktop sidecar
 * maps its own frames from its embedded sourcemap, and dev runs execute `.ts`
 * sources directly — neither has a `.map` sibling, so the mapper stays idle.
 */
export function defaultBundlePath(
  argv: readonly string[] = process.argv,
  versions: NodeJS.ProcessVersions = process.versions,
): string | undefined {
  if (versions.bun) return undefined;
  const entry = argv[1];
  return entry ? resolve(entry) : undefined;
}

/** Log sites repeat; positions are cached by generated line:column. */
const CACHE_LIMIT = 512;

function frameKey(frame: StackFrame): string {
  return `${frame.lineno}:${frame.colno}`;
}

function applyPosition(frame: StackFrame, position: OriginalPosition): void {
  frame.filename = position.file;
  frame.lineno = position.line;
  frame.colno = position.column + 1;
  // The bundle path itself reads as in-app; a frame that maps back into a
  // bundled dependency is not, and Sentry greys it out accordingly.
  frame.in_app = !position.file.includes("node_modules/");
}

export function createBundleFrameMapper(
  bundlePath: string | undefined,
): <E extends Event>(event: E) => E {
  /** undefined = not loaded yet; null = tried and unavailable. */
  let map: BundleSourceMap | null | undefined;
  const cache = new Map<string, OriginalPosition | null>();

  const isBundleFrame = (frame: StackFrame): boolean =>
    frame.filename === bundlePath && !!frame.lineno && !!frame.colno;

  return function mapBundleFrames<E extends Event>(event: E): E {
    if (!bundlePath) return event;
    const frames = stackHolders(event)
      .flatMap((holder) => holder.stacktrace?.frames ?? [])
      .filter(isBundleFrame);
    if (frames.length === 0) return event;
    if (map === undefined) map = BundleSourceMap.load(bundlePath) ?? null;
    if (map === null) return event;

    const pending = new Map<string, GeneratedPosition>();
    for (const frame of frames) {
      const key = frameKey(frame);
      if (!cache.has(key) && !pending.has(key)) {
        pending.set(key, {
          line: frame.lineno as number,
          column: (frame.colno as number) - 1,
        });
      }
    }
    if (pending.size > 0) {
      if (cache.size + pending.size > CACHE_LIMIT) cache.clear();
      const keys = [...pending.keys()];
      const positions = map.lookup([...pending.values()]);
      for (let i = 0; i < keys.length; i++) {
        cache.set(keys[i] as string, positions[i] ?? null);
      }
    }
    for (const frame of frames) {
      const position = cache.get(frameKey(frame));
      if (position) applyPosition(frame, position);
    }
    return event;
  };
}
