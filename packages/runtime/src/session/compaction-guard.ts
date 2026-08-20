import {
  type ExtensionFactory,
  compact as piCompact,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import {
  boundMessages,
  isInputSizeRejection,
  summarizerInputBudget,
} from "./summarizer-budget";

/**
 * COMPACTION OVERFLOW GUARD (HOU-709, PRODUCT-1394). pi's compaction
 * summarizes the pre-cut history by serializing ALL of it into ONE
 * summarization request against the active model — with no input bound. Once
 * a conversation's history outgrows the model's real input window (or
 * OpenAI's 10 MiB per-string cap — a 31MB codex request in prod), that
 * request is rejected, the turn errors with "Summarization failed", and
 * NOTHING ever shrinks the history — every later turn re-triggers the same
 * doomed compaction forever.
 *
 * This pi extension bounds the summarizer's input (sizing rules in
 * summarizer-budget.ts): it summarizes only the newest slice that fits the
 * budget and drops the rest (noting the drop in the summary), via pi's own
 * `compact()` so file-op tracking, split-turn handling, and the
 * previous-summary merge stay byte-identical to the default path. When the
 * input fits — every healthy compaction — it declines, and pi's default path
 * runs untouched. The chars/4 token estimate can UNDER-count dense content
 * (PRODUCT-1394: codex tokenized a bounded request past its 272k window), so
 * a size rejection of the bounded request retries with a halved budget
 * instead of deferring — deferring would hand pi's default an even LARGER
 * input that is guaranteed to fail: exactly the 31MB wedge this guard
 * exists to prevent.
 */

type Preparation = SessionBeforeCompactEvent["preparation"];
type CompactFn = typeof piCompact;

/**
 * Budget-halving attempts for the bounded request before giving up on
 * summarizing at all. One halving covers every tokenizer density seen in the
 * wild (~2.5 chars/token); two is margin for pathological content (~1).
 */
export const MAX_BOUNDED_ATTEMPTS = 3;

/** The summary preamble recording what the bounded summarizer never saw. */
export function droppedNotice(dropped: number, elided = 0): string {
  const parts: string[] = [];
  if (dropped > 0) {
    parts.push(
      `the oldest ${dropped} message(s) of this conversation exceeded ` +
        "the model's context window and were dropped without being summarized",
    );
  }
  if (elided > 0) {
    parts.push(
      `the middle of ${elided} oversized message(s) was elided before ` +
        "summarization",
    );
  }
  return `[Note: ${parts.join("; ")}.]`;
}

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * The `session_before_compact` extension. Injected into every agent loader
 * (resource-loader.ts), so both the long-lived server and the per-request
 * cloud runtime inherit it, on every compaction trigger (our proactive
 * autocompact, pi's threshold, pi's overflow recovery, provider switches).
 *
 * Failure posture: a transient failure inside the bounded path (rate limit,
 * network) declines back to pi's default — the turn fails visibly with the
 * real reason and the NEXT turn re-enters this guard, so nothing is dropped
 * on a blip. A SIZE rejection instead halves the budget and retries (the
 * input we sent was still too big; pi's unbounded default can only be
 * bigger). Only the truly unsummarizable — nothing fits even after eliding,
 * or every halved attempt is still size-rejected — compacts deterministically
 * (previous summary + drop notice, no model call), because every alternative
 * leaves the conversation wedged forever.
 */
export function makeCompactionGuard(
  compactFn: CompactFn = piCompact,
): ExtensionFactory {
  return (pi) => {
    pi.on("session_before_compact", async (event, ctx) => {
      const model = ctx.model;
      if (!model || model.contextWindow <= 0) return undefined;

      const fullBudget = summarizerInputBudget(model.contextWindow);
      const prep = event.preparation;

      const deterministic = (dropped: number, elided = 0) => {
        const summary = [prep.previousSummary, droppedNotice(dropped, elided)]
          .filter(Boolean)
          .join("\n\n");
        return {
          compaction: {
            summary,
            firstKeptEntryId: prep.firstKeptEntryId,
            tokensBefore: prep.tokensBefore,
          },
        };
      };

      let auth: Awaited<
        ReturnType<typeof ctx.modelRegistry.getApiKeyAndHeaders>
      > | null = null;
      for (let attempt = 0; attempt < MAX_BOUNDED_ATTEMPTS; attempt++) {
        const budget = Math.floor(fullBudget / 2 ** attempt);
        // History and turn prefix are summarized in SEPARATE requests
        // (pi runs them one after the other), so each gets the full budget.
        const history = boundMessages(prep.messagesToSummarize, budget);
        const prefix = boundMessages(prep.turnPrefixMessages, budget);
        const dropped = history.dropped + prefix.dropped;
        const elided = history.elided + prefix.elided;
        if (attempt === 0 && dropped === 0 && elided === 0) return undefined;
        if (history.kept.length === 0 && prefix.kept.length === 0) {
          // Not even an elided newest message fits: no summarization request
          // can succeed, ever. Compact deterministically so the conversation
          // survives with the recent (kept-live) messages.
          return deterministic(dropped);
        }

        if (!auth) {
          // Same auth pi's own compaction resolves (model-registry). Since pi
          // 0.84 the headers carry `null` deletion markers; pi's default path
          // strips them before compact(), so the bounded path must too.
          auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
          if (!auth.ok || !auth.apiKey) return undefined;
        }
        const headers = auth.headers
          ? Object.fromEntries(
              Object.entries(auth.headers).filter(
                (entry): entry is [string, string] => entry[1] !== null,
              ),
            )
          : undefined;
        const bounded: Preparation = {
          ...prep,
          messagesToSummarize: history.kept,
          turnPrefixMessages: prefix.kept,
        };
        console.info(
          `[compaction-guard] bounding summarization input: window=${model.contextWindow} ` +
            `budgetTokens=${budget} history=${prep.messagesToSummarize.length}->${history.kept.length} ` +
            `prefix=${prep.turnPrefixMessages.length}->${prefix.kept.length} ` +
            `elided=${elided} attempt=${attempt + 1}/${MAX_BOUNDED_ATTEMPTS}`,
        );
        try {
          const result = await compactFn(
            bounded,
            model,
            auth.apiKey,
            headers,
            event.customInstructions,
            event.signal,
            undefined,
            undefined,
            auth.env,
          );
          return {
            compaction: {
              ...result,
              summary: `${droppedNotice(dropped, elided)}\n\n${result.summary}`,
            },
          };
        } catch (err) {
          const message = errMessage(err);
          if (!isInputSizeRejection(message)) {
            // Transient: decline; pi's default path surfaces the turn's real
            // failure and the next compaction attempt re-enters this guard.
            console.warn(
              `[compaction-guard] bounded summarization failed; deferring to pi's default: ${message}`,
            );
            return undefined;
          }
          // The provider says our bounded input is STILL too big — the chars/4
          // estimate under-counted. Deferring would send the full, larger
          // input (guaranteed rejection), so shrink and try again instead.
          console.warn(
            `[compaction-guard] bounded summarization rejected for size at budgetTokens=${budget}; ` +
              `halving and retrying: ${message}`,
          );
        }
      }
      // Every halved attempt was size-rejected: summarization cannot succeed
      // at any budget we can express. Compact deterministically — the wedge
      // (an unshrinkable conversation) is strictly worse than a lossy note.
      console.warn(
        "[compaction-guard] all bounded summarization attempts size-rejected; compacting deterministically",
      );
      return deterministic(
        prep.messagesToSummarize.length + prep.turnPrefixMessages.length,
      );
    });
  };
}
