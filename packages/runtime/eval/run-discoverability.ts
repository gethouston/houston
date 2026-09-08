import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveModel } from "../src/ai/providers";
import { modelRuntime } from "../src/auth/storage";
import { buildAssistantRulesSection } from "../src/session/assistant-rules-context";
import { oneShotText } from "../src/session/one-shot";
import {
  DISCOVERABILITY_CASES,
  type DiscoverabilityCase,
} from "./discoverability-cases";

/**
 * THE MODEL HALF of the discoverability eval: `pnpm eval:assistant`.
 *
 * It asks a REAL model, with the coordinator's real always-on context in front
 * of it, which Houston operation each ordinary request needs - and whether it
 * refuses the four that Houston genuinely cannot do. That is the only way to
 * measure the failure this was written for: the model was not missing a tool,
 * it was answering from memory instead of reading its map.
 *
 * OPT-IN, never CI. It spends real tokens against the user's own connected
 * provider, so it runs when a person asks for it and exits with a named reason
 * when no provider is connected. The half that CAN run everywhere lives in
 * `discoverability.test.ts`.
 *
 * The model answers with a NAME, not a tool call: the question here is whether
 * the right operation is reachable from the map, and a name is what makes a
 * failure readable ("it answered renameAgent for a delete") instead of a
 * transcript to re-read.
 */

const INSTRUCTION = [
  "A person just said the line below to you.",
  "Answer with ONE line and nothing else:",
  "the exact name of the Houston operation you would use, as your map spells it,",
  "or the single word CANNOT if Houston has no operation for it.",
  "No explanation, no punctuation, no sentence.",
].join(" ");

interface Scored {
  case: DiscoverabilityCase;
  answer: string;
  passed: boolean;
}

function score(one: DiscoverabilityCase, answer: string): boolean {
  const said =
    answer
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^A-Za-z]/g, "") ?? "";
  return one.operations.length === 0
    ? said.toUpperCase() === "CANNOT"
    : one.operations.includes(said);
}

async function main(): Promise<void> {
  const section = buildAssistantRulesSection("coordinator");
  if (!section) throw new Error("the coordinator context is empty");
  const model = resolveModel();
  const cwd = mkdtempSync(join(tmpdir(), "houston-assistant-eval-"));
  const results: Scored[] = [];
  try {
    for (const one of DISCOVERABILITY_CASES) {
      const answer = await oneShotText({
        cwd,
        model,
        modelRuntime,
        systemPrompt: `${section}\n\n${INSTRUCTION}`,
        prompt: one.request,
      });
      const passed = score(one, answer);
      results.push({ case: one, answer: answer.trim(), passed });
      process.stdout.write(
        `${passed ? "PASS" : "FAIL"} ${one.id}: ${answer.trim().slice(0, 60)}\n`,
      );
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.passed);
  process.stdout.write(
    `\n${results.length - failed.length}/${results.length} found the right operation.\n`,
  );
  for (const { case: one, answer } of failed) {
    process.stdout.write(
      `  ${one.id}: expected ${one.operations.join(" or ") || "CANNOT"}, got ${JSON.stringify(answer)}\n`,
    );
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  // A missing provider is the ordinary way to arrive here (this eval is opt-in
  // and needs a real credential), so it is reported as the instruction it is
  // rather than a stack trace.
  process.stderr.write(
    `${err instanceof Error ? err.message : String(err)}\nConnect an AI provider in Houston, then run pnpm eval:assistant again.\n`,
  );
  process.exitCode = 1;
});
