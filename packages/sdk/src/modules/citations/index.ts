/**
 * The citations module: comments a person pins to regions of a previewed file
 * (selected text on a slide, or an area drawn over a chart) and sends to the
 * agent with their next message.
 *
 * A draft's comments are client state keyed by the composer's draft key, the
 * way its typed text is: they survive switching chats. Each draft publishes
 * its list at {@link CitationsModule.scope}, so the composer chips, the marks
 * on the page and the thumbnail counts all read one list.
 *
 * At send time {@link CitationsModule.compose} uploads each region's PNG crop
 * into the agent's `uploads/` folder (the composer attachment route) and folds
 * the comments into the message text: a model-facing list with the crop paths,
 * plus a hidden marker the sent bubble decodes into pills
 * (`@houston/wire-types` citations). The comments leave the draft while that
 * message is out, and are dropped only once the engine accepts it
 * ({@link CitationsModule.accept}); a refused or removed send gives them back
 * ({@link CitationsModule.release}).
 */

import {
  CITATION_COMMENT_MAX,
  decodeCitationsEnvelopes,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import type { FilesModule } from "../files";
import { randomNonce } from "../turns/random-nonce";
import { citedText, cropUploads } from "./compose";
import { capComment, DraftCitations, draftCitation } from "./draft-state";
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

/** The typed facade for a composer draft's citations. */
export interface CitationsModule {
  /** Comments one message may carry. */
  readonly limit: number;
  /** Characters one comment may hold. */
  readonly commentLimit: number;
  /** The store scope a draft's list publishes at. */
  scope(draftKey: string): string;
  list(draftKey: string): readonly DraftCitation[];
  add(draftKey: string, input: NewCitation): AddCitationResult;
  updateComment(draftKey: string, id: string, comment: string): void;
  remove(draftKey: string, id: string): void;
  /** Drop every draft's comments, and any message's still out (the crops are
   *  private to the person who made them, so an identity change takes all). */
  clearAll(): void;
  /** Flag the comments on pages a rewrite of `filePath` removed, unflag the
   *  ones whose page came back, and note the file's new page count. */
  reconcile(draftKey: string, filePath: string, pageCount: number): void;
  /** Upload the crops and fold the draft's comments into `text`, taking them
   *  out of the draft until {@link accept} or {@link release} sees the text.
   *  Unchanged text when the draft holds none. */
  compose(input: {
    agentId: string;
    draftKey: string;
    text: string;
  }): Promise<string>;
  /** The engine accepted a send whose prompt is `prompt`: the comments it
   *  carries are gone for good. */
  accept(prompt: string): void;
  /** A send whose prompt is `prompt` was refused, removed from the queue, or
   *  never left: its comments go back to their draft. */
  release(prompt: string): void;
  /** Lift the citations out of a sent message, or `null` when it has none. */
  decode(text: string): DecodedCitations | null;
}

export function createCitationsModule(
  ctx: ModuleContext,
  saveAttachments: FilesModule["saveAttachments"],
): CitationsModule {
  const state = new DraftCitations(ctx.store);
  const { list } = state;

  return {
    limit: CITATION_LIMIT,
    commentLimit: CITATION_COMMENT_MAX,
    /** The draft's store scope.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    scope: state.scope,
    /** The draft's comments, in the order the person added them.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    list,
    /** Pin a comment to the draft, unless it already holds the limit. A
     * `sharpCrop` still rendering replaces the preview crop when it lands.
     * @assistant group:files hidden: needs the person's own selection.
     * @assistant unroutable: no host request. */
    add(draftKey, { sharpCrop, ...input }) {
      const current = list(draftKey);
      if (current.length >= CITATION_LIMIT)
        return { ok: false, reason: "limit_reached", limit: CITATION_LIMIT };
      const citation = draftCitation(input, randomNonce());
      state.write(draftKey, [...current, citation]);
      if (sharpCrop)
        state.trackCrop(draftKey, citation.id, sharpCrop, (error) =>
          ctx.config.ports.logger.error("citation crop failed", {
            error: String(error),
          }),
        );
      return { ok: true, citation };
    },
    /** Change a pinned comment's text.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    updateComment(draftKey, id, comment) {
      state.update(draftKey, id, (c) => ({
        ...c,
        comment: capComment(comment),
      }));
    },
    /** Drop one comment from the draft.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    remove(draftKey, id) {
      state.write(
        draftKey,
        list(draftKey).filter((c) => c.id !== id),
      );
    },
    /** Drop every draft's comments.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    clearAll: () => state.clearAll(),
    /** Flag comments whose page a rewrite removed.
     * @assistant group:files hidden: composer draft state on this device.
     * @assistant unroutable: no host request. */
    reconcile(draftKey, filePath, pageCount) {
      const current = list(draftKey);
      let changed = false;
      const next = current.map((c) => {
        if (c.filePath !== filePath) return c;
        const detached = c.page > pageCount;
        if (detached === c.detached && pageCount === c.pageCount) return c;
        changed = true;
        return { ...c, detached, pageCount };
      });
      if (changed) state.write(draftKey, next);
    },
    /** Fold the draft's comments into an outgoing message.
     * @assistant group:files hidden: sends the person's own composer draft.
     * @assistant unroutable: crops ride the attachments route. */
    async compose({ agentId, draftKey, text }) {
      const taken = await state.take(draftKey);
      if (!taken) return text;
      const { citations, restore } = taken;
      try {
        const paths = await Promise.all(
          cropUploads(citations).map(async (crop) => {
            const [path] = await saveAttachments(agentId, draftKey, [crop]);
            return path ?? "";
          }),
        );
        const { text: cited, envelope } = citedText(text, citations, paths);
        state.hold({ envelope, draftKey, citations });
        return cited;
      } catch (error) {
        restore();
        throw error;
      }
    },
    /** Drop the comments an accepted send carried.
     * @assistant group:files hidden: send bookkeeping on this device.
     * @assistant unroutable: no host request. */
    accept: (prompt) => state.accept(prompt),
    /** Give a dropped send's comments back to their draft.
     * @assistant group:files hidden: send bookkeeping on this device.
     * @assistant unroutable: no host request. */
    release: (prompt) => state.giveBack(prompt),
    /** Decode a sent message's citations for rendering.
     * @assistant group:files hidden: rendering helper.
     * @assistant unroutable: pure decoding. */
    decode: decodeCitationsEnvelopes,
  };
}
