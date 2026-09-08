import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { expect, test } from "vitest";
import { buildAssistantRulesSection } from "./assistant-rules-context";

/**
 * The assistant's always-on context: the map of what it can do, then the loop
 * it runs every request through. Both are load-bearing for the same reason the
 * gates inside `houston_call` are: the model has real, destructive reach, and
 * these lines are what keep it from deleting something in order to edit it,
 * routing around a confirmation, or telling a user something is impossible
 * without having looked.
 */

const forAssistant = (): string =>
  buildAssistantRulesSection("coordinator") ?? "";

test("the context follows the ROLE the host gave this runtime, not its directory", () => {
  // The managed assistant pod runs under `/workspace` with an ordinarily-named
  // agent: a directory-shaped gate leaves that pod holding the coordinator's
  // Houston-wide toolset with none of these rails on it.
  expect(forAssistant()).toContain("# How you operate in Houston");
  expect(buildAssistantRulesSection(null)).toBeNull();
});

test("the capability map is carried in front of the rules", () => {
  // The incident: asked to delete a mission, Houston answered that missions
  // cannot be deleted while `deleteActivity` sat in the catalog, visible. The
  // map is what removes "I did not know it existed" from the loop, and the
  // rules refer to it as the thing above them.
  const section = forAssistant();
  expect(section).toContain(ASSISTANT_CAPABILITY_INDEX);
  expect(section).toContain("deleteActivity");
  expect(section.indexOf(ASSISTANT_CAPABILITY_INDEX)).toBeLessThan(
    section.indexOf("# How you operate in Houston"),
  );
  expect(section).toContain("look in the map above");
});

test("nothing may be called impossible before the search comes back empty", () => {
  const section = forAssistant();
  expect(section).toContain("search houston_capabilities");
  expect(section).toContain(
    "NEVER tell them something cannot be done until that search comes back empty",
  );
  expect(section).toContain("Houston cannot do that yet");
});

test("the user never hears what happens behind the scenes", () => {
  const section = forAssistant();
  expect(section).toContain("not technical");
  expect(section).toMatch(/no operation names, no identifiers, no tool/);
});

test("the loop covers every behaviour the incidents turned up", () => {
  const section = forAssistant();
  // Destructive work waits for the user, and a refusal is never routed around.
  expect(section).toContain("wait for their answer");
  expect(section).toContain("never work around one with a different operation");
  expect(section).toContain("ask which one they mean");
  // Values are read, never guessed: the colour incident and the provider one.
  expect(section).toContain("houston_describe");
  expect(section).toContain("listAgents");
  expect(section).toContain("listAgentProviders");
  expect(section).toContain("palette");
  expect(section).toContain(
    "A value you have not read is a value you are guessing",
  );
  expect(section).toContain("NEVER delete and recreate");
  expect(section).toContain("never guess a second format");
  // The report is honest about what actually happened.
  expect(section).toContain("Report what actually happened");
  expect(section).toContain(
    "Never describe a change you did not manage to make",
  );
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
  expect(section).toContain("Work itself is never yours");
  expect(section).toContain("propose creating one");
  expect(section).toContain("tell the user where it lives");
});

test("the rules stay short and leak no internals beyond tool names", () => {
  const rules = forAssistant().split("# How you operate in Houston")[1] ?? "";
  expect(rules.split("\n").length).toBeLessThanOrEqual(20);
  for (const banned of [".houston", ".assistant", "JSON", "HTTP", "schema"]) {
    expect(rules).not.toContain(banned);
  }
});
