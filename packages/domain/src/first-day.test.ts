import { expect, test } from "vitest";
import { withInitialConfigSeed } from "./first-day";
import { CONFIG_SEED_KEY, keepHostOwnedConfig } from "./first-day-config";
import { isAgentSetupMode } from "./first-day-mode";
import { firstDayBrief } from "./first-day-prompt";
import { docKey } from "./layout";

test("the setup task is recognized by its mode sentinel alone", () => {
  expect(isAgentSetupMode("houston:agent-setup")).toBe(true);
  expect(isAgentSetupMode("agent-setup")).toBe(false);
  expect(isAgentSetupMode(null)).toBe(false);
  expect(isAgentSetupMode(undefined)).toBe(false);
});

test("the brief is read off the job description's frontmatter", () => {
  const md = "---\nindustry:  Finance \nrole: Financial   analyst\n---\n\nBody";
  expect(firstDayBrief(md)).toEqual({
    context: "Finance",
    role: "Financial analyst",
  });
});

test("half a brief, or none, is no brief", () => {
  expect(firstDayBrief("---\nindustry: Finance\n---\n")).toBeUndefined();
  expect(firstDayBrief("Just a description")).toBeUndefined();
  expect(firstDayBrief("")).toBeUndefined();
  expect(firstDayBrief(null)).toBeUndefined();
});

test("the config seed sits at the config document's path", () => {
  expect(CONFIG_SEED_KEY).toBe(docKey("", "config").slice(1));
});

test("the initial config folds into the seeds, canonical provider id", () => {
  const seeds = withInitialConfigSeed(
    { "CLAUDE.md": "x" },
    {
      provider: "openai",
      model: "gpt-5",
      firstDay: "pending",
      arrival: "created",
    },
  );
  expect(seeds?.["CLAUDE.md"]).toBe("x");
  expect(JSON.parse(seeds?.[CONFIG_SEED_KEY] ?? "")).toEqual({
    provider: "openai-codex",
    model: "gpt-5",
    firstDay: "pending",
    arrival: "created",
  });
});

test("a template's own config keeps what the initial config does not name", () => {
  const seeds = withInitialConfigSeed(
    { [CONFIG_SEED_KEY]: JSON.stringify({ effort: "high", model: "old" }) },
    { model: "new", firstDay: "pending" },
  );
  expect(JSON.parse(seeds?.[CONFIG_SEED_KEY] ?? "")).toEqual({
    effort: "high",
    model: "new",
    firstDay: "pending",
  });
});

test("an empty initial config leaves the seeds untouched", () => {
  const seeds = { "CLAUDE.md": "x" };
  expect(withInitialConfigSeed(seeds, undefined)).toBe(seeds);
  expect(withInitialConfigSeed(seeds, {})).toBe(seeds);
  expect(withInitialConfigSeed(undefined, undefined)).toBeUndefined();
});

test("a config write never moves a started first day back to pending", () => {
  expect(
    keepHostOwnedConfig(
      { model: "m", firstDay: "pending", arrival: "imported" },
      { firstDay: "started", arrival: "created" },
    ),
  ).toEqual({ model: "m", firstDay: "started", arrival: "created" });
});

test("a config write taken before the seed landed keeps the pending first day", () => {
  expect(
    keepHostOwnedConfig(
      { model: "m" },
      { firstDay: "pending", arrival: "created" },
    ),
  ).toEqual({ model: "m", firstDay: "pending", arrival: "created" });
});

test("a config write cannot invent a first day the host never recorded", () => {
  expect(keepHostOwnedConfig({ model: "m", firstDay: "pending" }, {})).toEqual({
    model: "m",
  });
});
