import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { houstonSystemPrompt } from "../../../host/src/houston-prompt";
import { buildBridgedToolSet } from "../backends/claude/mcp-tool-set";
import { buildTurnCommonTools } from "../turn/turn-toolset";
import {
  withNextStepSuggestions,
  withNextStepSuggestionTools,
} from "./next-step-suggestions";

const prompt =
  "Keep this.\n<next_step_suggestions>\nCall suggest_actions.\n</next_step_suggestions>\nAlso this.";

test("off replaces the product suggestion mandate with a silent opt-out", () => {
  expect(withNextStepSuggestions(prompt, false)).toBe(
    "Keep this.\nThe user turned next-step suggestions off. Do not offer follow-up buttons or mention, explain, or apologize for their absence.\nAlso this.",
  );
});

test("on keeps the prompt byte-identical", () => {
  expect(withNextStepSuggestions(prompt)).toBe(prompt);
  expect(withNextStepSuggestions(prompt, true)).toBe(prompt);
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

test("off, no tool the model sees on pi or Claude names suggest_actions", () => {
  const turn = {
    conversationId: "c",
    text: "hi",
    provider: "openai-codex",
    turnId: "t",
    emit: () => {},
    signal: undefined,
  };
  const piTools = withNextStepSuggestionTools(
    [...buildTurnCommonTools(turn, null, "/tmp")],
    false,
  );
  const claudeTools = buildBridgedToolSet({ nextStepSuggestions: false });
  for (const tools of [piTools, claudeTools]) {
    const seen = JSON.stringify(
      tools.map((t) => [t.name, t.description, t.parameters]),
    );
    expect(seen).toContain("suggest_reusable");
    expect(seen).not.toContain("suggest_actions");
  }
});

test("off keeps every other tool as the same object, wrappers included", () => {
  const wrapped = { name: "suggest_reusable", execute: () => "logged" };
  const other = { name: "ask_user", execute: () => "gated" };
  const off = withNextStepSuggestionTools(
    [{ name: "suggest_actions" }, wrapped, other],
    false,
  );
  expect(off).toHaveLength(2);
  expect(off[0]).toBe(wrapped);
  expect(off[1]).toBe(other);
});

test("on, the tools pass through unchanged", () => {
  const tools = [{ name: "suggest_actions" }, { name: "suggest_reusable" }];
  expect(withNextStepSuggestionTools(tools)).toEqual(tools);
  expect(withNextStepSuggestionTools(tools, true)).toEqual(tools);
});

test("off omits the actual host and desktop product mandates", () => {
  const desktop = readFileSync(
    new URL(
      "../../../../app/src-tauri/src/houston_prompt/base.rs",
      import.meta.url,
    ),
    "utf8",
  );
  for (const product of [houstonSystemPrompt(), desktop]) {
    expect(withNextStepSuggestions(product)).toBe(product);
    expect(withNextStepSuggestions(product, true)).toBe(product);
    expect(product).toContain("Finish every non-blocking turn with");
    expect(withNextStepSuggestions(product, false)).toContain(
      "The user turned next-step suggestions off. Do not offer follow-up buttons or mention, explain, or apologize for their absence.",
    );
    expect(withNextStepSuggestions(product, false)).not.toContain(
      "<next_step_suggestions>",
    );
    expect(withNextStepSuggestions(product, false)).not.toContain(
      "Finish every non-blocking turn with",
    );
    expect(withNextStepSuggestions(product, false)).not.toContain(
      "Ending with no follow-ups is not an option.",
    );
    expect(withNextStepSuggestions(product, false)).not.toContain(
      "suggest_actions",
    );
    expect(withNextStepSuggestions(product, false)).toContain(
      "before `ask_user`, `request_connection`, `request_credential`, or `suggest_reusable`.",
    );
  }
});
