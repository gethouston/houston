import { expect, test } from "vitest";
import {
  connectedProviderList,
  type ProviderOption,
  resolveModelChoice,
  resolveProviderChoice,
} from "./provider-choice";

/**
 * The closed provider/model set every agent-facing pin resolves through. The
 * incident: an assistant asked for a mission on "codex", then "openai" — both
 * refused with a bare "unknown provider", nothing naming the real id
 * (`openai-codex`) or the connected set, so it guessed twice and gave up.
 */

const OPTIONS: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-5.5", "gpt-5.5-codex"],
  },
  { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
  { id: "openrouter", name: "OpenRouter", connected: true },
];

const OP = "start_mission";

test("the id, the display name and any casing all resolve to the id", () => {
  for (const raw of [
    "openai-codex",
    "OpenAI-Codex",
    "ChatGPT / Codex (Plus / Pro)",
    "chatgpt / codex (plus / pro)",
    "  openai-codex  ",
  ]) {
    expect(resolveProviderChoice(raw, OPTIONS, OP)).toEqual({
      ok: true,
      id: "openai-codex",
    });
  }
});

test("the friendly aliases the model reaches for resolve, never guess", () => {
  for (const raw of ["codex", "Codex", "openai", "ChatGPT"]) {
    expect(resolveProviderChoice(raw, OPTIONS, OP)).toEqual({
      ok: true,
      id: "openai-codex",
    });
  }
});

test("the short name a user speaks resolves to the long pi id", () => {
  const options: ProviderOption[] = [
    { id: "google", name: "Google Gemini", connected: true },
    { id: "amazon-bedrock", name: "Amazon Bedrock", connected: true },
    { id: "github-copilot", name: "GitHub Copilot", connected: true },
  ];
  expect(resolveProviderChoice("Gemini", options, OP)).toEqual({
    ok: true,
    id: "google",
  });
  expect(resolveProviderChoice("bedrock", options, OP)).toEqual({
    ok: true,
    id: "amazon-bedrock",
  });
  expect(resolveProviderChoice("Copilot", options, OP)).toEqual({
    ok: true,
    id: "github-copilot",
  });
});

test("an unknown provider names every connected option, id and display name", () => {
  const out = resolveProviderChoice("gemini-cli", OPTIONS, OP);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error("expected a refusal");
  expect(out.reason).toBe("unknown");
  expect(out.message).toContain('"gemini-cli"');
  expect(out.message).toContain("openai-codex (ChatGPT / Codex (Plus / Pro))");
  expect(out.message).toContain("openrouter (OpenRouter)");
  // A disconnected provider is not an option to steer the model toward.
  expect(out.message).not.toContain("anthropic");
});

test("a known but disconnected provider is refused by name, not silently started", () => {
  const out = resolveProviderChoice("claude", OPTIONS, OP);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error("expected a refusal");
  expect(out.reason).toBe("disconnected");
  expect(out.message).toContain("anthropic");
  expect(out.message).toContain("Claude (Pro / Max)");
  expect(out.message).toMatch(/connect/i);
  expect(out.message).toContain("openai-codex (ChatGPT / Codex (Plus / Pro))");
});

test("with nothing connected the pin is refused as unpinnable, not as a typo", () => {
  const out = resolveProviderChoice("codex", [], OP);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error("expected a refusal");
  expect(out.message).toMatch(/no ai provider is connected/i);
  expect(out.message).toMatch(/omit/i);
});

test("connectedProviderList renders id + display name, connected only", () => {
  expect(connectedProviderList(OPTIONS)).toBe(
    "openai-codex (ChatGPT / Codex (Plus / Pro)), openrouter (OpenRouter)",
  );
  expect(connectedProviderList([])).toBe("");
});

test("a model is checked only where the registry enumerates the provider's models", () => {
  const codex = OPTIONS[0];
  const openrouter = OPTIONS[2];
  if (!codex || !openrouter) throw new Error("fixture");
  expect(resolveModelChoice("gpt-5.5", codex, OP)).toEqual({
    ok: true,
    id: "gpt-5.5",
  });
  const bad = resolveModelChoice("gpt5", codex, OP);
  expect(bad.ok).toBe(false);
  if (bad.ok) throw new Error("expected a refusal");
  expect(bad.message).toContain("gpt-5.5-codex");
  expect(bad.message).toContain("openai-codex");
  // An open-catalog provider (no enumerated models) accepts the id and lets the
  // provider's own error surface.
  expect(resolveModelChoice("anything/at-all", openrouter, OP)).toEqual({
    ok: true,
    id: "anything/at-all",
  });
});

const ANTHROPIC_LINEUP_OPTION: ProviderOption = {
  id: "anthropic",
  name: "Claude (Pro / Max)",
  connected: true,
  models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"],
};

test("a legacy or retired Claude id resolves in its own family instead of being refused", () => {
  const cases: Record<string, string> = {
    opus: "claude-opus-5-5",
    "claude-opus-4-8": "claude-opus-5-5",
    "claude-opus-5": "claude-opus-5-5",
    "claude-sonnet-4-6": "claude-sonnet-5-5",
    "claude-fable-5": "claude-fable-5-1",
  };
  for (const [written, id] of Object.entries(cases))
    expect(resolveModelChoice(written, ANTHROPIC_LINEUP_OPTION, OP)).toEqual({
      ok: true,
      id,
    });
});

test("the name a user says for a model resolves to the id, per provider", () => {
  const codex: ProviderOption = {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-6-astra", "gpt-5.6-luna", "gpt-5.3-codex-spark"],
  };
  expect(resolveModelChoice("Luna", codex, OP)).toEqual({
    ok: true,
    id: "gpt-5.6-luna",
  });
  expect(resolveModelChoice("Codex Spark", codex, OP)).toEqual({
    ok: true,
    id: "gpt-5.3-codex-spark",
  });
  expect(resolveModelChoice("Opus 5.5", ANTHROPIC_LINEUP_OPTION, OP)).toEqual({
    ok: true,
    id: "claude-opus-5-5",
  });
  // A bare family name lands on that family's lineup model.
  expect(resolveModelChoice("sonnet", ANTHROPIC_LINEUP_OPTION, OP)).toEqual({
    ok: true,
    id: "claude-sonnet-5-5",
  });
  expect(resolveModelChoice("Fable", ANTHROPIC_LINEUP_OPTION, OP)).toEqual({
    ok: true,
    id: "claude-fable-5-1",
  });
});

test("a name belonging to another provider is refused, never cross-pinned", () => {
  const out = resolveModelChoice("Luna", ANTHROPIC_LINEUP_OPTION, OP);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error("expected a refusal");
  // The refusal names the ids AND the names, so the next call can be right.
  expect(out.message).toContain("claude-sonnet-5-5 = Sonnet 5.5");
  expect(out.message).toContain("claude-opus-5-5 = Opus 5.5");
  expect(out.message).toContain("claude-fable-5-1 = Fable 5.1");
});

test("an open-catalog provider still resolves a name it has a table for", () => {
  const codex: ProviderOption = {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
  };
  expect(resolveModelChoice("Astra", codex, OP)).toEqual({
    ok: true,
    id: "gpt-6-astra",
  });
  // Anything the table does not know still rides through untouched.
  expect(resolveModelChoice("some-new-id", codex, OP)).toEqual({
    ok: true,
    id: "some-new-id",
  });
});
