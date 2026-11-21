import { isSurveyQuestion } from "../../components/onboarding/survey-steps.ts";
import type {
  Script,
  ScriptLine,
  ScriptPrompt,
  ScriptReceipt,
} from "./script-types.ts";

const ENDING: ReadonlySet<ScriptPrompt["kind"]> = new Set([
  "finish",
  "openChat",
]);

export function finalize(lines: ScriptLine[], prompt: ScriptPrompt): Script {
  const last = lines.findLastIndex((line) => line.kind === "receipt");
  const ended = ENDING.has(prompt.kind);
  return {
    prompt,
    lines: lines.map((line, index) => {
      if (line.kind !== "receipt") return line;
      const open = line.editable || (isSurveyQuestion(line.question) && !ended);
      return { ...line, editable: index === last && open };
    }),
  };
}

export function changeableAnswer(
  lines: readonly ScriptLine[],
): ScriptReceipt | null {
  const line = lines.findLast((each) => each.kind === "receipt");
  return line?.kind === "receipt" && line.editable ? line : null;
}
