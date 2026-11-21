import { resolve } from "node:path";
import type { Event, StackFrame } from "@sentry/core";
import { stackHolders } from "./frames";
import {
  BundleSourceMap,
  type GeneratedPosition,
  type OriginalPosition,
} from "./source-map";

export function defaultBundlePath(
  argv: readonly string[] = process.argv,
  versions: NodeJS.ProcessVersions = process.versions,
): string | undefined {
  if (versions.bun) return undefined;
  const entry = argv[1];
  return entry ? resolve(entry) : undefined;
}

const CACHE_LIMIT = 512;

function frameKey(frame: StackFrame): string {
  return `${frame.lineno}:${frame.colno}`;
}

function applyPosition(frame: StackFrame, position: OriginalPosition): void {
  frame.filename = position.file;
  frame.lineno = position.line;
  frame.colno = position.column + 1;
  frame.in_app = !position.file.includes("node_modules/");
}

export function createBundleFrameMapper(
  bundlePath: string | undefined,
): <E extends Event>(event: E) => E {
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
