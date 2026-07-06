/**
 * Merge primitives for the catalog build: fold provider model entries by their
 * cross-provider key into unique `CatalogModel`s. Internal to `catalog.ts`.
 */
import type { ModelOption } from "../providers.ts";
import { normalizeKey } from "./catalog-key.ts";
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
 * Keep one candidate per provider. The identity/descriptive base is the
 * cleanest (shortest) id — that preserves the snapshot's `releaseDate`, name,
 * and description for a merged model. Two things override that base, so a
 * dropped variant never silently takes data down with it:
 *
 * - Capabilities are OR-ed across the merge — e.g. openrouter's
 *   `qwen-plus-0728:thinking` has a longer id than the plain `qwen-plus-0728`
 *   yet is the one flagged `reasoning: true`; keeping only the shorter id used
 *   to silently lose it.
 * - Pricing + context come from a LIVE OpenRouter entry (`source: "live"`) when
 *   one is present for this `(key, providerId)`, never the stale baked snapshot.
 *   This is deterministic, unlike the id-length tiebreak that decides the base.
 *
 * Recency (`releaseDate`) is deliberately NOT taken from live: the host mapper
 * omits `isNew`, so live entries carry no date and OpenRouter "New" badges stay
 * snapshot-derived (see `catalog-live.ts`). The base's date wins, falling back
 * to the other candidate's so a live base does not drop it.
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
  const base = cleaner ? cand : existing;
  const other = cleaner ? existing : cand;
  // Pricing/context authority: the live entry (if either candidate is one),
  // else the base. Context falls back to the base when live omits it.
  const live =
    cand.raw.source === "live"
      ? cand
      : existing.raw.source === "live"
        ? existing
        : undefined;
  const econ = live ?? base;
  base.raw = {
    ...base.raw,
    reasoning: base.raw.reasoning || other.raw.reasoning || undefined,
    toolCall: base.raw.toolCall || other.raw.toolCall || undefined,
    imageGen: base.raw.imageGen || other.raw.imageGen || undefined,
    attachment: base.raw.attachment || other.raw.attachment || undefined,
    releaseDate: base.raw.releaseDate ?? other.raw.releaseDate,
    context: econ.raw.context ?? base.raw.context,
    costIn: econ.raw.costIn ?? base.raw.costIn,
    costOut: econ.raw.costOut ?? base.raw.costOut,
  };
  draft.byProvider.set(cand.providerId, base);
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
    toolCall: candidates.some((c) => c.raw.toolCall === true),
    imageGen: candidates.some((c) => c.raw.imageGen === true),
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

/** A curated OAuth model as a raw entry: the snapshot match, or a synthetic. */
export function curatedRaw(model: ModelOption, match?: RawModel): RawModel {
  return (
    match ?? {
      key: normalizeKey(model.label),
      id: model.id,
      name: model.label,
      context: model.contextWindow,
    }
  );
}
