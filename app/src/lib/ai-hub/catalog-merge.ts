/**
 * Merge primitives for the catalog build: fold provider model entries by their
 * cross-provider key into unique `CatalogModel`s. Internal to `catalog.ts`.
 */
import type { ModelOption } from "../providers.ts";
import { HOME_PROVIDER } from "./catalog-lab.ts";
import type { RawModel } from "./catalog-snapshot.ts";
import type { CatalogModel, CatalogOffer, LabId } from "./catalog-types.ts";

export interface Candidate {
  providerId: string;
  raw: RawModel;
  subscription: boolean;
  lab: LabId;
}
export interface Draft {
  byProvider: Map<string, Candidate>;
}

/**
 * Keep one candidate per provider, preferring the cleanest (shortest) id, but
 * OR the capability flags across the merge so a dropped variant doesn't take
 * its support down with it — e.g. openrouter's `qwen-plus-0728:thinking` has a
 * longer id than the plain `qwen-plus-0728` yet is the one flagged
 * `reasoning: true`; keeping only the shorter id used to silently lose it.
 */
export function addCandidate(
  drafts: Map<string, Draft>,
  cand: Candidate,
): void {
  let draft = drafts.get(cand.raw.key);
  if (!draft) {
    draft = { byProvider: new Map() };
    drafts.set(cand.raw.key, draft);
  }
  const existing = draft.byProvider.get(cand.providerId);
  if (!existing) {
    draft.byProvider.set(cand.providerId, cand);
    return;
  }
  const cleaner =
    cand.raw.id.length < existing.raw.id.length ||
    (cand.raw.id.length === existing.raw.id.length &&
      cand.raw.id < existing.raw.id);
  const survivor = cleaner ? cand : existing;
  const dropped = cleaner ? existing : cand;
  survivor.raw = {
    ...survivor.raw,
    reasoning: survivor.raw.reasoning || dropped.raw.reasoning || undefined,
    toolCall: survivor.raw.toolCall || dropped.raw.toolCall || undefined,
    attachment: survivor.raw.attachment || dropped.raw.attachment || undefined,
  };
  draft.byProvider.set(cand.providerId, survivor);
}

/** The lab most candidates agree on, ignoring `other` unless it is all there is. */
function pickLab(candidates: Candidate[]): LabId {
  const counts = new Map<LabId, number>();
  for (const c of candidates) counts.set(c.lab, (counts.get(c.lab) ?? 0) + 1);
  let best: LabId = "other";
  let bestCount = 0;
  for (const c of candidates) {
    if (c.lab === "other") continue;
    const n = counts.get(c.lab) ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = c.lab;
    }
  }
  return best;
}

function buildOffer(cand: Candidate): CatalogOffer {
  const offer: CatalogOffer = {
    providerId: cand.providerId,
    modelId: cand.raw.id,
    subscription: cand.subscription,
  };
  if (cand.raw.context !== undefined) offer.context = cand.raw.context;
  if (!cand.subscription) {
    if (cand.raw.costIn !== undefined) offer.costInput = cand.raw.costIn;
    if (cand.raw.costOut !== undefined) offer.costOutput = cand.raw.costOut;
  }
  return offer;
}

/** Collapse a draft's per-provider candidates into one merged model. */
export function finalize(key: string, draft: Draft): CatalogModel {
  const candidates = [...draft.byProvider.values()];
  const lab = pickLab(candidates);
  const home = HOME_PROVIDER[lab];
  const canonical =
    (home ? candidates.find((c) => c.providerId === home) : undefined) ??
    [...candidates].sort(
      (a, b) =>
        a.raw.name.length - b.raw.name.length ||
        (a.raw.name < b.raw.name ? -1 : 1),
    )[0];
  const pick = <T>(get: (r: RawModel) => T | undefined): T | undefined => {
    const own = get(canonical.raw);
    if (own !== undefined) return own;
    for (const c of candidates) {
      const v = get(c.raw);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  return {
    key,
    name: canonical.raw.name,
    lab,
    description: pick((r) => r.description),
    reasoning: candidates.some((c) => c.raw.reasoning === true),
    inputModalities: pick((r) => r.input) ?? [],
    knowledge: pick((r) => r.knowledge),
    releaseDate: candidates
      .map((c) => c.raw.releaseDate)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1),
    context: pick((r) => r.context),
    output: pick((r) => r.output),
    offers: candidates
      .map(buildOffer)
      .sort((a, b) =>
        a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : 0,
      ),
  };
}

/** Sort newest-first; models without a release date sort last, then by name. */
export function compareModels(a: CatalogModel, b: CatalogModel): number {
  const ra = a.releaseDate ?? "";
  const rb = b.releaseDate ?? "";
  if (ra !== rb) return ra < rb ? 1 : -1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Minimal key for a curated model that has no snapshot match (defensive). */
function fallbackKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s*\.\s*/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .trim();
}

/** A curated OAuth model as a raw entry: the snapshot match, or a synthetic. */
export function curatedRaw(model: ModelOption, match?: RawModel): RawModel {
  return (
    match ?? {
      key: fallbackKey(model.label),
      id: model.id,
      name: model.label,
      context: model.contextWindow,
    }
  );
}
