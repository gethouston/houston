import {
  CITATION_COMMENT_MAX,
  CITATION_QUOTE_MAX,
  citationAnchorSchema,
} from "@houston/wire-types";
import type { ScopeStore } from "../../store";
import type { DraftCitation, NewCitation } from "./types";

export const capComment = (comment: string) =>
  comment.trim().slice(0, CITATION_COMMENT_MAX);

/** A new comment as its draft keeps it: anchor checked, text capped. */
export function draftCitation(
  input: Omit<NewCitation, "sharpCrop">,
  id: string,
): DraftCitation {
  const parsed = citationAnchorSchema.parse(input.anchor);
  return {
    ...input,
    anchor:
      parsed.kind === "text"
        ? { ...parsed, quote: parsed.quote.slice(0, CITATION_QUOTE_MAX) }
        : parsed,
    comment: capComment(input.comment),
    id,
    detached: input.page > input.pageCount,
  };
}

const EMPTY: readonly DraftCitation[] = [];

/** Comments a composed message carries, out of their draft until the engine
 *  accepts that message or it is dropped. */
interface Claim {
  envelope: string;
  draftKey: string;
  citations: readonly DraftCitation[];
}

/**
 * Every draft's comments. The visible list of each draft is published at its
 * store scope; a composed message takes its comments out of it (so the next
 * send cannot carry them twice) and holds them as a claim keyed by the
 * envelope its text carries. Whatever send path that text then takes, the
 * envelope inside its prompt finds the claim again: an accepted send drops
 * the comments for good, a refused or removed one puts them back.
 */
export class DraftCitations {
  private readonly drafts = new Set<string>();
  private claims: Claim[] = [];
  private readonly crops = new Map<string, Promise<void>>();
  /** Bumped by `clearAll`: work started before it lands nowhere. */
  private generation = 0;

  constructor(private readonly store: ScopeStore) {}

  scope = (draftKey: string) => `citations/${draftKey}`;

  list = (draftKey: string): readonly DraftCitation[] =>
    (this.store.getSnapshot(this.scope(draftKey)) as
      | DraftCitation[]
      | undefined) ?? EMPTY;

  write(draftKey: string, next: readonly DraftCitation[]): void {
    if (next.length) this.drafts.add(draftKey);
    else this.drafts.delete(draftKey);
    this.store.publish(this.scope(draftKey), next.length ? next : EMPTY);
  }

  update(
    draftKey: string,
    id: string,
    patch: (c: DraftCitation) => DraftCitation,
  ): void {
    const current = this.list(draftKey);
    if (!current.some((c) => c.id === id)) return;
    this.write(
      draftKey,
      current.map((c) => (c.id === id ? patch(c) : c)),
    );
  }

  /** Swap the sharp crop in once it renders. `compose` waits for it. */
  trackCrop(
    draftKey: string,
    id: string,
    crop: Promise<string>,
    onError: (error: unknown) => void,
  ): void {
    const generation = this.generation;
    const done = crop.then(
      (cropBase64) => {
        if (generation !== this.generation) return;
        this.update(draftKey, id, (c) => ({ ...c, cropBase64 }));
      },
      (error: unknown) => {
        if (generation === this.generation) onError(error);
      },
    );
    const settled = done.finally(() => {
      if (this.crops.get(id) === settled) this.crops.delete(id);
    });
    this.crops.set(id, settled);
  }

  /** Wait for the sharp crops of `draftKey`'s comments, then take them out of
   *  the draft. `null` when the draft holds none, or when an identity change
   *  dropped them meanwhile. */
  async take(draftKey: string): Promise<{
    citations: readonly DraftCitation[];
    restore: () => void;
  } | null> {
    const generation = this.generation;
    const waiting = this.list(draftKey).flatMap((c) => {
      const crop = this.crops.get(c.id);
      return crop ? [crop] : [];
    });
    if (waiting.length) await Promise.all(waiting);
    if (generation !== this.generation) return null;
    const citations = this.list(draftKey);
    if (citations.length === 0) return null;
    this.write(draftKey, EMPTY);
    return {
      citations,
      restore: () => {
        if (generation === this.generation)
          this.write(draftKey, [...citations, ...this.list(draftKey)]);
      },
    };
  }

  hold(claim: Claim): void {
    this.claims.push(claim);
  }

  /** The claims whose envelope `prompt` carries, removed from the held set. */
  private release(prompt: string): Claim[] {
    const found = this.claims.filter((c) => prompt.includes(c.envelope));
    if (found.length)
      this.claims = this.claims.filter((c) => !found.includes(c));
    return found;
  }

  accept(prompt: string): void {
    this.release(prompt);
  }

  giveBack(prompt: string): void {
    for (const claim of this.release(prompt))
      this.write(claim.draftKey, [
        ...claim.citations,
        ...this.list(claim.draftKey),
      ]);
  }

  clearAll(): void {
    this.generation++;
    this.claims = [];
    this.crops.clear();
    for (const draftKey of [...this.drafts]) this.write(draftKey, EMPTY);
  }
}
