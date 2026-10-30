import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { houstonSystemPrompt } from "../../../host/src/houston-prompt";
import { buildBridgedToolSet } from "../backends/claude/mcp-tool-set";
import { buildTurnCommonTools } from "../turn/turn-toolset";
import { withNextStepSuggestions } from "./next-step-suggestions";

const prompt =
  "Keep this.\n<next_step_suggestions>\nCall suggest_actions.\n</next_step_suggestions>\nAlso this.";

test("off removes only the product suggestion section, on keeps it", () => {
  expect(withNextStepSuggestions(prompt, false)).toBe("Keep this.\nAlso this.");
  expect(withNextStepSuggestions(prompt)).toBe(prompt);
});

for (const enabled of [undefined, true, false]) {
  test(`suggestion tool registration follows ${enabled} on pi and Claude`, () => {
    const turn = {
      conversationId: "c",
      text: "hi",
      provider: "openai-codex",
      turnId: "t",
      emit: () => {},
      signal: undefined,
      nextStepSuggestions: enabled,
    };
    expect(
      buildTurnCommonTools(turn, null, "/tmp").some(
        (tool) => tool.name === "suggest_actions",
      ),
    ).toBe(enabled !== false);
    expect(
      buildBridgedToolSet({ nextStepSuggestions: enabled }).some(
        (tool) => tool.name === "suggest_actions",
      ),
    ).toBe(enabled !== false);
  });
}

test("off omits the actual host and desktop product mandates", () => {
  const desktop = readFileSync(
    new URL(
      "../../../../app/src-tauri/src/houston_prompt/base.rs",
      import.meta.url,
    ),
    "utf8",
  );
  for (const product of [houstonSystemPrompt(), desktop]) {
    expect(product).toContain("Finish every non-blocking turn with");
    expect(withNextStepSuggestions(product, false)).not.toContain(
      "Finish every non-blocking turn with",
    );
    expect(withNextStepSuggestions(product, false)).not.toContain(
      "Ending with no follow-ups is not an option.",
    );
  }
});
