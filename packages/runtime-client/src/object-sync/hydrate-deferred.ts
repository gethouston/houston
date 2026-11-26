import type { HydrateCandidate } from "./hydrate-candidates";
import {
  HydrateClaims,
  type HydrateDownloadState,
  type HydrateEntry,
} from "./hydrate-download";
import { admitLater, type Settled } from "./hydrate-later";
import { HydrateLimitError, listedBytes } from "./hydrate-limit";
import type { ObjectMetadata } from "./object-manifest";

async function admitted(opts: {
  listedLater?: Promise<Settled<readonly ObjectMetadata[]>>;
  admit: Parameters<typeof admitLater>[1];
  refusal?: HydrateLimitError;
}): Promise<HydrateCandidate[]> {
  const settled = await opts.listedLater;
  if (!settled) return [];
  if (!settled.ok) throw opts.refusal ?? settled.error;
  return admitLater(settled.value, opts.admit);
}

export function startDeferredPhase(opts: {
  later: readonly HydrateCandidate[];
  listedLater?: Promise<Settled<readonly ObjectMetadata[]>>;
  admit: Parameters<typeof admitLater>[1];
  refusal?: HydrateLimitError;
  sizes: ReadonlyMap<string, number>;
  maxBytes: number;
  state: HydrateDownloadState;
  download: (entries: HydrateEntry[], claims?: HydrateClaims) => Promise<void>;
  onListed?: (rels: readonly string[]) => void;
}): {
  run: () => Promise<void>;
  prioritize: (rels: readonly string[]) => void;
} {
  let entries: ReadonlyMap<string, HydrateEntry> | undefined;
  const promoted: Promise<void>[] = [];
  const prioritize = (rels: readonly string[]) => {
    for (const rel of rels) {
      const entry = entries?.get(rel);
      if (!entry || entry.link !== undefined || opts.state.failed) continue;
      if (!claims.take(rel)) {
        claims.want(rel);
        continue;
      }
      promoted.push(
        opts.download([entry]).then(
          () => undefined,
          (error: unknown) => opts.state.fail(error),
        ),
      );
    }
  };
  const claims = new HydrateClaims((rel) => prioritize([rel]));
  return {
    async run() {
      const extra = await admitted(opts);
      const all = [...opts.later, ...extra];
      opts.onListed?.(all.map(({ rel }) => rel));
      if (opts.refusal) throw opts.refusal;
      const bytes = listedBytes(all, opts.sizes);
      if (bytes > opts.maxBytes)
        throw new HydrateLimitError(opts.maxBytes, bytes);
      entries = new Map(all.map((entry) => [entry.rel, entry]));
      await opts.download(all, claims);
      while (promoted.length > 0) await Promise.all(promoted.splice(0));
      if (opts.state.failed) throw opts.state.firstError;
    },
    prioritize,
  };
}
