/**
 * Merge primitives for the catalog build: fold the pi-ai catalog's per-provider
 * model entries by their cross-provider key into unique `CatalogModel`s, then
 * enrich them from the models.dev snapshot. Internal to `catalog.ts`.
 */
import { HOME_PROVIDER } from "./catalog-lab.ts";
import type { RawModel } from "./catalog-snapshot.ts";
import type { CatalogModel, CatalogOffer, LabId } from "./catalog-types.ts";

export interface Candidate {
  providerId: string;
  raw: RawModel;
  subscription: boolean;
  lab: LabId;
}

/**
 * The snapshot-derived metadata pi-ai can't supply, folded onto a draft that
 * already exists from the pi-ai catalog. Never creates existence, an offer, or
 * economics — only fills these gaps.
 */
export interface Enrichment {
  description?: string;
  toolCall?: boolean;
  imageGen?: boolean;
  knowledge?: string;
  releaseDate?: string;
}

export interface Draft {
  byProvider: Map<string, Candidate>;
  enrich?: Enrichment;
}

/**
 * Keep one candidate per provider for a model. pi-ai lists some models more than
 * once under the SAME provider (e.g. Bedrock's regional Opus 4.8 variants); those
 * collapse to a single offer. The identity/economics base is the cleanest
 * (shortest, then lexically-first) id, so a dropped variant never silently takes
 * data down with it: every capability flag (reasoning, vision/image input,
 * toolCall, attachment, imageGen) is OR-ed across the merge, and the base's
 * context/pricing win with the other's as a fallback.
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
  const hasImage =
    base.raw.input?.includes("image") || other.raw.input?.includes("image");
  base.raw = {
    ...base.raw,
    reasoning: base.raw.reasoning || other.raw.reasoning || undefined,
    toolCall: base.raw.toolCall || other.raw.toolCall || undefined,
    attachment: base.raw.attachment || other.raw.attachment || undefined,
    imageGen: base.raw.imageGen || other.raw.imageGen || undefined,
    input: hasImage ? ["text", "image"] : base.raw.input,
    context: base.raw.context ?? other.raw.context,
    output: base.raw.output ?? other.raw.output,
    costIn: base.raw.costIn ?? other.raw.costIn,
    costOut: base.raw.costOut ?? other.raw.costOut,
  };
  draft.byProvider.set(cand.providerId, base);
}

/**
 * Fold ONE models.dev snapshot model into the catalog as OPTIONAL enrichment.
 * Matched by `key`, it fills the metadata pi-ai's runnable catalog lacks
 * (description / toolCall / imageGen / knowledge / releaseDate) on a model that
 * ALREADY exists from pi-ai. It no-ops when no pi-ai draft carries the key, so a
 * snapshot-only model NEVER appears and the runnable set stays pi-ai's. It never
 * touches existence, offers, pricing, context, reasoning, or vision — those are
 * pi-ai's authority.
 */
export function foldEnrichment(
  drafts: Map<string, Draft>,
  raw: RawModel,
): void {
  const draft = drafts.get(raw.key);
  if (!draft) return;
  const e = draft.enrich ?? {};
  if (raw.description && !e.description) e.description = raw.description;
  if (raw.knowledge && !e.knowledge) e.knowledge = raw.knowledge;
  if (raw.toolCall) e.toolCall = true;
  if (raw.imageGen) e.imageGen = true;
  if (raw.releaseDate && (!e.releaseDate || raw.releaseDate > e.releaseDate))
    e.releaseDate = raw.releaseDate;
  draft.enrich = e;
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
  const enrich = draft.enrich;
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
    description: pick((r) => r.description) ?? enrich?.description,
    reasoning: candidates.some((c) => c.raw.reasoning === true),
    toolCall:
      candidates.some((c) => c.raw.toolCall === true) || !!enrich?.toolCall,
    imageGen:
      candidates.some((c) => c.raw.imageGen === true) || !!enrich?.imageGen,
    inputModalities: pick((r) => r.input) ?? [],
    knowledge: pick((r) => r.knowledge) ?? enrich?.knowledge,
    releaseDate: [
      ...candidates.map((c) => c.raw.releaseDate),
      enrich?.releaseDate,
    ]
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
