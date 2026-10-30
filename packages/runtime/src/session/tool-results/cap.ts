import {
  HOUSTON_CALL_TOOL_NAME,
  HOUSTON_CAPABILITIES_TOOL_NAME,
  HOUSTON_DESCRIBE_TOOL_NAME,
  HOUSTON_RECALL_TOOL_NAME,
} from "../tools/assistant";
import {
  LIST_AGENTS_TOOL_NAME,
  LIST_MISSIONS_TOOL_NAME,
  READ_AGENT_TOOL_NAME,
} from "../tools/mission-tool-names";
import { READ_MISSION_TOOL_NAME } from "../tools/read-mission";

/**
 * The most text one Houston tool result puts in front of the model (~5k
 * tokens). The rest is saved to a file the model can read (./spill.ts).
 *
 * Every result is re-sent on every later request until the conversation
 * compacts, so one 64k-character app payload cost ~16k tokens per request for
 * the rest of the chat. The head is enough for the model to see what came back
 * and decide whether it needs more.
 */
export const RESULT_HEAD_CHARS = 20_000;

/**
 * The tools whose results are capped: the ones that return whatever an app,
 * a program or Houston's own API hands back. File tools are left alone: they
 * have their own limits, and they are how the model reads a capped result.
 */
export const CAPPED_TOOLS: ReadonlySet<string> = new Set([
  "integration_execute",
  "integration_search",
  "run_code",
  HOUSTON_CAPABILITIES_TOOL_NAME,
  HOUSTON_DESCRIBE_TOOL_NAME,
  HOUSTON_CALL_TOOL_NAME,
  HOUSTON_RECALL_TOOL_NAME,
  LIST_MISSIONS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  READ_AGENT_TOOL_NAME,
  READ_MISSION_TOOL_NAME,
]);

/** The head of an oversized result, ending with where the rest is. */
export function cappedResultText(text: string, savedAt: string): string {
  return `${text.slice(0, RESULT_HEAD_CHARS)}\n\n[This result is ${text.length.toLocaleString("en-US")} characters, so only the first ${RESULT_HEAD_CHARS.toLocaleString("en-US")} are shown. The full result is saved at ${savedAt} (relative to your working directory). Read that file, with an offset to skip what you have seen, when you need the rest.]`;
}
