import { expect, test } from "vitest";
import { buildAssistantRulesSection } from "./assistant-rules-context";

/**
 * The assistant's operating rules. They exist because the model has real,
 * destructive reach through houston_call: the rules that keep it from deleting
 * something in order to edit it, or from routing around a confirmation, are as
 * load-bearing as the gates in the tool itself.
 */

const forAssistant = (): string =>
  buildAssistantRulesSection("coordinator") ?? "";

test("the rules follow the ROLE the host gave this runtime, not its directory", () => {
  // The managed assistant pod runs under `/workspace` with an ordinarily-named
  // agent: a directory-shaped gate leaves that pod holding the coordinator's
  // Houston-wide toolset with none of these rails on it.
  expect(forAssistant()).toContain("# How you operate in Houston");
  expect(buildAssistantRulesSection(null)).toBeNull();
});

test("the rules cover every behaviour the incident turned up", () => {
  const section = forAssistant();
  expect(section).toContain("NEVER delete and recreate");
  expect(section).toContain("houston_capabilities");
  expect(section).toContain("houston_describe");
  expect(section).toContain("Never guess a second format");
  expect(section).toContain("needing confirmation");
  expect(section).toContain("Never retry it");
  expect(section).toContain("navy or teal");
  expect(section).toContain("Never describe a change you did not manage");
});

test("every named value is read before it is written, never guessed", () => {
  const section = forAssistant();
  // The incident: it wrote "codex" and then "openai" for a provider whose real
  // id is openai-codex, guessing twice against a list it never read.
  expect(section).toContain("Before writing a value that names something");
  // The read is NAMED: "look it up" with no operation is another guess.
  expect(section).toContain("listAgentProviders");
  expect(section).toContain("listAgents");
});

test("a named model or provider is pinned, never quietly defaulted", () => {
  const section = forAssistant();
  // The incident: asked for "Luna" / "Sonnet", it sent the provider alone and
  // every mission ran on that provider's default model instead.
  expect(section).toContain("names a model or provider");
  expect(section).toContain("pin it exactly");
  expect(section).toMatch(/ask.*never start the mission on a default/i);
});

test("the rules pin who Houston is and where its work runs", () => {
  const section = forAssistant();
  // Identity: the incident had Houston telling the user the chat ran "under
  // the Dobby agent" while the work sat on its own hidden board.
  expect(section).toContain("personal assistant");
  expect(section).toContain("no board of your own");
  expect(section).toContain("never claim work ran somewhere it did not");
  // Dispatcher: work belongs to an agent the user can see, named out loud.
  expect(section).toContain("do not do work yourself");
  expect(section).toContain("propose creating one");
  expect(section).toContain("tell the user where it lives");
});

test("the rules stay short and leak no internals beyond tool names", () => {
  const section = forAssistant();
  expect(section.split("\n").length).toBeLessThanOrEqual(40);
  for (const banned of [".houston", ".assistant", "JSON", "HTTP", "schema"]) {
    expect(section).not.toContain(banned);
  }
});
