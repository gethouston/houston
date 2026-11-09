/**
 * The citations module: comments a person pins to regions of a previewed file
 * (selected text on a slide, or an area drawn over a chart) and sends to the
 * agent with their next message.
 *
 * A draft's comments are client state keyed by the composer's draft key, the
 * way its typed text is: they survive switching chats and clear only once a
 * send carrying them is accepted. Each draft publishes its list at
 * {@link CitationsModule.scope}, so the composer chips, the marks on the page
 * and the thumbnail counts all read one list.
 *
 * At send time {@link CitationsModule.compose} uploads each region's PNG crop
 * into the agent's `uploads/` folder (the composer attachment route) and folds
 * the comments into the message text: a model-facing list with the crop paths,
 * plus a hidden marker the sent bubble decodes into pills
 * (`@houston/wire-types` citations).
 */

import {
  citationAnchorSchema,
  decodeCitationsEnvelopes,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import type { FilesModule } from "../files";
import { randomNonce } from "../turns/random-nonce";
import { citedText, cropUploads } from "./compose";
import {
  type AddCitationResult,
  CITATION_LIMIT,
  type DecodedCitations,
  type DraftCitation,
  type NewCitation,
} from "./types";

export type {
  AddCitationResult,
  DecodedCitations,
  DraftCitation,
  NewCitation,
} from "./types";
export { CITATION_LIMIT } from "./types";

const EMPTY: readonly DraftCitation[] = [];

/** The typed facade for a composer draft's citations. */
export interface CitationsModule {
  /** Comments one message may carry. */
  readonly limit: number;
  /** The store scope a draft's list publishes at. */
  scope(draftKey: string): string;
  list(draftKey: string): readonly DraftCitation[];
  add(draftKey: string, input: NewCitation): AddCitationResult;
  updateComment(draftKey: string, id: string, comment: string): void;
  remove(draftKey: string, id: string): void;
  /** Drop the draft's comments: all of them, or only `ids` (the ones a send
   *  just carried, so a comment added while it was in flight survives). */
  clear(draftKey: string, ids?: readonly string[]): void;
  /** Drop every draft's comments (the crops are private to the person who
   *  made them, so an identity change takes them all). */
  clearAll(): void;
  /** Flag the comments on pages a rewrite of `filePath` removed, and unflag
   *  the ones whose page came back. */
  reconcile(draftKey: string, filePath: string, pageCount: number): void;
  /** Upload the crops and fold the draft's comments into `text`. Unchanged
   *  text when the draft holds none. */
  compose(input: {
    agentId: string;
    draftKey: string;
    text: string;
  }): Promise<{ text: string; ids: string[] }>;
  /** Lift the citations out of a sent message, or `null` when it has none. */
  decode(text: string): DecodedCitations | null;
}

export function createCitationsModule(
  ctx: ModuleContext,
  saveAttachments: FilesModule["saveAttachments"],
): CitationsModule {
  const scope = (draftKey: string) => `citations/${draftKey}`;
  const list = (draftKey: string) =>
    (ctx.store.getSnapshot(scope(draftKey)) as DraftCitation[] | undefined) ??
    EMPTY;
  const drafts = new Set<string>();
  const write = (draftKey: string, next: readonly DraftCitation[]) => {
    if (next.length) drafts.add(draftKey);
    else drafts.delete(draftKey);
    ctx.store.publish(scope(draftKey), next.length ? next : EMPTY);
  };

  return {
    limit: CITATION_LIMIT,
    /** The draft's store scope.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    scope,
    /** The draft's comments, in the order the person added them.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    list,
    /** Pin a comment to the draft, unless it already holds the limit.
     * @assistant group:files hidden: needs the person's own selection.
     * @assistant unroutable: no host request. */
    add(draftKey, input) {
      const current = list(draftKey);
      if (current.length >= CITATION_LIMIT)
        return { ok: false, reason: "limit_reached", limit: CITATION_LIMIT };
      const anchor = citationAnchorSchema.parse(input.anchor);
      const citation: DraftCitation = {
        ...input,
        anchor,
        id: randomNonce(),
        detached: input.page > input.pageCount,
      };
      write(draftKey, [...current, citation]);
      return { ok: true, citation };
    },
    /** Change a pinned comment's text.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    updateComment(draftKey, id, comment) {
      write(
        draftKey,
        list(draftKey).map((c) => (c.id === id ? { ...c, comment } : c)),
      );
    },
    /** Drop one comment from the draft.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    remove(draftKey, id) {
      write(
        draftKey,
        list(draftKey).filter((c) => c.id !== id),
      );
    },
    /** Drop every comment from the draft.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    clear(draftKey, ids) {
      const current = list(draftKey);
      const keep = ids ? current.filter((c) => !ids.includes(c.id)) : EMPTY;
      if (keep.length !== current.length) write(draftKey, keep);
    },
    /** Drop every draft's comments.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    clearAll() {
      for (const draftKey of [...drafts]) write(draftKey, EMPTY);
    },
    /** Flag comments whose page a rewrite removed.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    reconcile(draftKey, filePath, pageCount) {
      const current = list(draftKey);
      let changed = false;
      const next = current.map((c) => {
        if (c.filePath !== filePath) return c;
        const detached = c.page > pageCount;
        if (detached === c.detached) return c;
        changed = true;
        return { ...c, detached };
      });
      if (changed) write(draftKey, next);
    },
    /** Fold the draft's comments into an outgoing message.
     * @assistant group:files hidden: sends the person's own composer draft.
     * @assistant unroutable: crops ride the attachments route. */
    async compose({ agentId, draftKey, text }) {
      const citations = list(draftKey);
      if (citations.length === 0) return { text, ids: [] };
      const paths = await Promise.all(
        cropUploads(citations).map(async (crop) => {
          const [path] = await saveAttachments(agentId, draftKey, [crop]);
          return path ?? "";
        }),
      );
      return {
        text: citedText(text, citations, paths),
        ids: citations.map((c) => c.id),
      };
    },
    /** Decode a sent message's citations for rendering.
     * @assistant group:files hidden: rendering helper.
     * @assistant unroutable: pure decoding. */
    decode: decodeCitationsEnvelopes,
  };
}
