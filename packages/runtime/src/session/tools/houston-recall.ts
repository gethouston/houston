import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { getHistory } from "../../store/conversations";
import { currentConversationId } from "../conversation-context";
import { type SessionToolErrorDetails, toolErrorResult } from "./tool-error";

/**
 * `houston_recall` — the personal assistant searching its OWN conversation.
 *
 * The assistant runs ONE long-lived chat that autocompacts, so what the user
 * said weeks ago has left the model's context while it is still on disk in the
 * transcript store. This is the way back to it, and the reason it can be
 * IN-PROCESS like read_mission: the transcript is this runtime's own store, so
 * there is nothing to proxy and no secret involved. Output is bounded the same
 * way, so a conversation of any age can never flood the calling turn's context.
 */
export const HOUSTON_RECALL_TOOL_NAME = "houston_recall";

/** Hits one call returns. */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Characters of surrounding text kept on EACH side of a match. */
const CONTEXT_CHARS = 300;

/**
 * Per-hit and whole-result caps, mirroring read_mission's magnitudes. The
 * per-hit cap is not implied by CONTEXT_CHARS: an excerpt also contains the
 * matched text itself, and the MODEL chooses the query, so a pathologically
 * long one is bounded here rather than passed through.
 */
const MAX_HIT_CHARS = 1_500;
const MAX_TOTAL_CHARS = 24_000;

/**
 * What one `houston_recall` call did. `no_conversation` is the tool running
 * outside a turn (nothing to search); the searched variant carries the counts
 * a caller needs to tell "no matches" apart from "matches trimmed to fit".
 */
export type HoustonRecallDetails =
  | { outcome: "no_conversation" }
  | {
      outcome: "searched";
      query: string;
      matched: number;
      returned: number;
      totalMessages: number;
    }
  | SessionToolErrorDetails;

const RecallParams = Type.Object({
  query: Type.String({
    description:
      "Text to look for across everything the user has said to you and everything you replied. Matched as a plain case-insensitive substring, so use one distinctive word or name they would have used ('dentist', 'Acme', 'Lisbon') rather than a whole sentence.",
  }),
  limit: Type.Optional(
    Type.Number({
      description: `How many matches to return, newest first (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
    }),
  ),
});
type RecallParams = Static<typeof RecallParams>;

/**
 * A stored message's time as ISO. Messages written before the store stamped
 * `ts` carry none, and "Invalid Date" would read to the model as a real answer.
 */
function timestampOf(ts: number | undefined): string {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) {
    return "time unknown";
  }
  return new Date(ts).toISOString();
}

/** The matched text plus its surroundings, ellipsised where it was cut. */
function excerptAround(content: string, at: number, matchLength: number) {
  const start = Math.max(0, at - CONTEXT_CHARS);
  const end = Math.min(content.length, at + matchLength + CONTEXT_CHARS);
  const body = content.slice(start, end).trim();
  const clipped =
    body.length > MAX_HIT_CHARS
      ? `${body.slice(0, MAX_HIT_CHARS)} [...]`
      : body;
  const head = start > 0 ? "[...] " : "";
  const tail = end < content.length ? " [...]" : "";
  return `${head}${clipped}${tail}`;
}

function textResult(
  text: string,
  details: HoustonRecallDetails,
): AgentToolResult<HoustonRecallDetails> {
  return { content: [{ type: "text" as const, text }], details };
}

export function makeHoustonRecallTool() {
  return defineTool({
    name: HOUSTON_RECALL_TOOL_NAME,
    label: "Search our earlier conversation",
    description:
      "Search everything the user has told you and everything you replied, back to the very start of this conversation - far beyond the recent part you can still see. Use it whenever they refer to something from before (a name, a preference, a decision, 'the thing I mentioned') instead of asking them to repeat it or guessing. Returns the matching moments newest first, each with who said it, when, and the words around it.",
    promptSnippet: "Search our earlier conversation",
    parameters: RecallParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: RecallParams,
    ): Promise<AgentToolResult<HoustonRecallDetails>> {
      const query = params.query.trim();
      if (!query) {
        return toolErrorResult({
          code: "empty_query",
          message:
            "houston_recall needs something to search for. Pass one distinctive word or name from what the user is referring to, such as a person, a place or a product.",
        });
      }
      const conversationId = currentConversationId();
      if (!conversationId) {
        return textResult(
          "There is no conversation to search: this ran outside a chat with the user, so nothing has been said yet.",
          { outcome: "no_conversation" },
        );
      }
      // ONE full read: the store is parse-cache-backed, so re-reading per term
      // would re-walk the whole transcript for nothing.
      const history = getHistory(conversationId);
      const messages = history?.messages ?? [];
      const totalMessages = history?.totalMessages ?? 0;
      const needle = query.toLowerCase();
      const limit = Math.min(
        Math.max(Math.floor(params.limit ?? DEFAULT_LIMIT), 1),
        MAX_LIMIT,
      );

      // Newest-first fill so the total cap drops the OLDEST hits — what the user
      // said most recently is what they are most likely referring to.
      const hits: string[] = [];
      let matched = 0;
      let budget = MAX_TOTAL_CHARS;
      let trimmed = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        const content = message.content ?? "";
        const at = content.toLowerCase().indexOf(needle);
        if (at < 0) continue;
        matched += 1;
        if (trimmed || hits.length >= limit) continue;
        const line = `[${message.role} - ${timestampOf(message.ts)}] ${excerptAround(content, at, needle.length)}`;
        if (line.length > budget) {
          trimmed = true;
          continue;
        }
        budget -= line.length;
        hits.push(line);
      }

      if (matched === 0) {
        return textResult(
          `Nothing in your conversation with the user matches "${query}" (searched all ${totalMessages} messages). Try a different word - a name, a place, or how they would have phrased it themselves.`,
          { outcome: "searched", query, matched, returned: 0, totalMessages },
        );
      }
      const header = `${matched} match${matched === 1 ? "" : "es"} for "${query}" in your conversation with the user (${totalMessages} messages), showing ${hits.length} newest first.`;
      const note = trimmed
        ? "\n\n[... older matches omitted to stay within bounds - search a narrower word to reach them]"
        : "";
      return textResult(`${header}\n\n${hits.join("\n\n")}${note}`, {
        outcome: "searched",
        query,
        matched,
        returned: hits.length,
        totalMessages,
      });
    },
  });
}
