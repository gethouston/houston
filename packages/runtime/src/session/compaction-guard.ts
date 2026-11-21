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

type Preparation = SessionBeforeCompactEvent["preparation"];
type CompactFn = typeof piCompact;

export const MAX_BOUNDED_ATTEMPTS = 3;

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
        const history = boundMessages(prep.messagesToSummarize, budget);
        const prefix = boundMessages(prep.turnPrefixMessages, budget);
        const dropped = history.dropped + prefix.dropped;
        const elided = history.elided + prefix.elided;
        if (attempt === 0 && dropped === 0 && elided === 0) return undefined;
        if (history.kept.length === 0 && prefix.kept.length === 0) {
          return deterministic(dropped);
        }

        if (!auth) {
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
            console.warn(
              `[compaction-guard] bounded summarization failed; deferring to pi's default: ${message}`,
            );
            return undefined;
          }
          console.warn(
            `[compaction-guard] bounded summarization rejected for size at budgetTokens=${budget}; ` +
              `halving and retrying: ${message}`,
          );
        }
      }
      console.warn(
        "[compaction-guard] all bounded summarization attempts size-rejected; compacting deterministically",
      );
      return deterministic(
        prep.messagesToSummarize.length + prep.turnPrefixMessages.length,
      );
    });
  };
}
