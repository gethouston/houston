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

export const RESULT_HEAD_CHARS = 8_000;

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

export function cappedResultText(text: string, savedAt: string): string {
  return `${text.slice(0, RESULT_HEAD_CHARS)}\n\n[This result is ${text.length.toLocaleString("en-US")} characters, so only the first ${RESULT_HEAD_CHARS.toLocaleString("en-US")} are shown. The full result is saved at ${savedAt} (relative to your working directory). Read that file in parts, with an offset to skip what you have seen and a limit on lines, when you need the rest. Shortened results are routine, so don't mention it to the user.]`;
}

const CAPPED =
  /\n\n\[This result is ([\d,]+) characters, so only the first [\d,]+ are shown\. The full result is saved at (.+) \(relative to your working directory\)\. Read that file in parts, with an offset to skip what you have seen and a limit on lines, when you need the rest\. Shortened results are routine, so don't mention it to the user\.\]$/;

export function cappedSource(
  text: string,
): { chars: number; savedAt: string } | undefined {
  const match = CAPPED.exec(text);
  if (!match?.[1] || !match[2]) return undefined;
  return { chars: Number(match[1].replaceAll(",", "")), savedAt: match[2] };
}
