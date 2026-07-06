import {
  type ExtensionFactory,
  estimateTokens,
  compact as piCompact,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

/**
 * COMPACTION OVERFLOW GUARD (HOU-709). pi's compaction summarizes the pre-cut
 * history by serializing ALL of it into ONE summarization request against the
 * active model — with no input bound. Once a conversation's history outgrows
 * the model's real input window (long-running shared routine chats get there
 * on schedule), that request is rejected (`context_length_exceeded`), the
 * turn errors with "Summarization failed", and NOTHING ever shrinks the
 * history — every later turn re-triggers the same doomed compaction forever.
 *
 * This pi extension bounds the summarizer's input: when the messages to
 * summarize don't plausibly fit the model's window, it summarizes only the
 * newest slice that fits and drops the rest (noting the drop in the summary),
 * via pi's own `compact()` so file-op tracking, split-turn handling, and the
 * previous-summary merge stay byte-identical to the default path. When the
 * input fits — every healthy compaction — it declines, and pi's default path
 * runs untouched.
 */

type Preparation = SessionBeforeCompactEvent["preparation"];
type AgentMessage = Preparation["messagesToSummarize"][number];
type CompactFn = typeof piCompact;

/**
 * Fraction of the model's context window the summarization request's input
 * may use (as estimated by pi's chars/4 heuristic). The remainder absorbs the
 * estimate's error, the summarizer's prompt scaffolding, and the reserved
 * summary output — generous because a too-big request is a wedged
 * conversation, while a too-small one only loses some old context to the
 * drop notice.
 */
export const SUMMARIZER_INPUT_FRACTION = 0.7;

/** The summarizer's input token budget for a model window (0 = unknown). */
export function summarizerInputBudget(contextWindow: number): number {
  return Math.floor(contextWindow * SUMMARIZER_INPUT_FRACTION);
}

/**
 * Keep the NEWEST messages whose estimated tokens fit the budget — the same
 * newest-first accumulation pi's branch summarization uses, so what survives
 * is the context closest to the work in flight. Returns the kept slice in
 * chronological order plus how many older messages fell off.
 */
export function boundMessages(
  messages: AgentMessage[],
  budget: number,
): { kept: AgentMessage[]; dropped: number } {
  const kept: AgentMessage[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const cost = estimateTokens(message);
    if (total + cost > budget) break;
    total += cost;
    kept.unshift(message);
  }
  return { kept, dropped: messages.length - kept.length };
}

/** The summary preamble recording what the bounded summarizer never saw. */
export function droppedNotice(dropped: number): string {
  return (
    `[Note: the oldest ${dropped} message(s) of this conversation exceeded ` +
    "the model's context window and were dropped without being summarized.]"
  );
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
 * on a blip. Only the truly unsummarizable (not even the newest message fits)
 * compacts deterministically — previous summary + drop notice, no model call —
 * because every alternative leaves the conversation wedged forever.
 */
export function makeCompactionGuard(
  compactFn: CompactFn = piCompact,
): ExtensionFactory {
  return (pi) => {
    pi.on("session_before_compact", async (event, ctx) => {
      const model = ctx.model;
      if (!model || model.contextWindow <= 0) return undefined;

      const budget = summarizerInputBudget(model.contextWindow);
      const prep = event.preparation;
      // History and turn prefix are summarized in SEPARATE requests
      // (pi runs them in parallel), so each gets the full budget.
      const history = boundMessages(prep.messagesToSummarize, budget);
      const prefix = boundMessages(prep.turnPrefixMessages, budget);
      if (history.dropped === 0 && prefix.dropped === 0) return undefined;

      const dropped = history.dropped + prefix.dropped;
      if (history.kept.length === 0 && prefix.kept.length === 0) {
        // Even the newest message alone overflows the budget: no
        // summarization request can succeed, ever. Compact deterministically
        // so the conversation survives with the recent (kept-live) messages.
        const summary = [prep.previousSummary, droppedNotice(dropped)]
          .filter(Boolean)
          .join("\n\n");
        return {
          compaction: {
            summary,
            firstKeptEntryId: prep.firstKeptEntryId,
            tokensBefore: prep.tokensBefore,
          },
        };
      }

      try {
        // Same auth pi's own compaction resolves (model-registry).
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok || !auth.apiKey) return undefined;
        const bounded: Preparation = {
          ...prep,
          messagesToSummarize: history.kept,
          turnPrefixMessages: prefix.kept,
        };
        const result = await compactFn(
          bounded,
          model,
          auth.apiKey,
          auth.headers,
          event.customInstructions,
          event.signal,
          undefined,
          undefined,
          auth.env,
        );
        return {
          compaction: {
            ...result,
            summary: `${droppedNotice(dropped)}\n\n${result.summary}`,
          },
        };
      } catch (err) {
        // Decline; pi's default path surfaces the turn's real failure and the
        // next compaction attempt re-enters this guard.
        console.warn(
          `[compaction-guard] bounded summarization failed; deferring to pi's default: ${errMessage(err)}`,
        );
        return undefined;
      }
    });
  };
}
