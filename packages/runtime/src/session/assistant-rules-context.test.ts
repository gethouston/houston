import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { expect, test } from "vitest";
import {
  buildAssistantRulesSection,
  RULES_HEADING,
} from "./assistant-rules-context";

const forAssistant = (): string =>
  buildAssistantRulesSection("coordinator") ?? "";

test("the context follows the ROLE the host gave this runtime, not its directory", () => {
  expect(forAssistant()).toContain(RULES_HEADING);
  expect(buildAssistantRulesSection(null)).toBeNull();
});

test("the capability map is carried in front of the rules", () => {
  const section = forAssistant();
  expect(section).toContain(ASSISTANT_CAPABILITY_INDEX);
  expect(section).toContain("deleteActivity");
  expect(section.indexOf(ASSISTANT_CAPABILITY_INDEX)).toBeLessThan(
    section.indexOf(RULES_HEADING),
  );
  expect(section).toContain("look in the map above");
});

test("nothing may be called impossible before the search comes back empty", () => {
  const section = forAssistant();
  expect(section).toContain("search houston_capabilities");
  expect(section).toContain(
    "NEVER tell them something cannot be done until that search comes back empty",
  );
  expect(section).toContain("say plainly that you cannot do that yet");
});

test("the user never hears what happens behind the scenes", () => {
  const section = forAssistant();
  expect(section).toContain("not technical");
  expect(section).toMatch(/no operation names, no identifiers, no tool/);
});

test("the loop covers every behaviour the incidents turned up", () => {
  const section = forAssistant();
  expect(section).toContain("wait for their answer");
  expect(section).toContain("never work around one with a different operation");
  expect(section).toContain("ask which one they mean");
  expect(section).toContain("houston_describe");
  expect(section).toContain("listAgents");
  expect(section).toContain("listAgentProviders");
  expect(section).toContain("palette");
  expect(section).toContain(
    "A value you have not read is a value you are guessing",
  );
  expect(section).toContain("NEVER delete and recreate");
  expect(section).toContain("never guess a second format");
  expect(section).toContain("Report what actually happened");
  expect(section).toContain(
    "Never describe a change you did not manage to make",
  );
});

test("a named model or provider is pinned, never quietly defaulted", () => {
  const section = forAssistant();
  expect(section).toContain("names a model or provider");
  expect(section).toContain("pin it exactly");
  expect(section).toMatch(/ask.*never start the mission on a default/i);
});

test("the rules pin who Houston is and where its work runs", () => {
  const section = forAssistant();
  expect(section).toContain(
    "You are Houston, the user's AI Manager: mission control for their team of AI Employees",
  );
  expect(section).toContain("Introduce yourself as Houston");
  expect(section).toContain("never about Houston in the third person");
  const rules = section.split(RULES_HEADING)[1] ?? "";
  expect(rules).not.toMatch(/Houston (can|cannot)\b|THIS Houston/);
  expect(section).toContain("no board of your own");
  expect(section).toContain("never claim work ran somewhere it did not");
  expect(section).toContain("Work itself is never yours");
  expect(section).toContain("propose creating one");
  expect(section).toContain("tell the user where it lives");
});

test("the rules stay short and leak no internals beyond tool names", () => {
  const rules =
    (buildAssistantRulesSection("coordinator", {}) ?? "").split(
      RULES_HEADING,
    )[1] ?? "";
  expect(rules.split("\n").length).toBeLessThanOrEqual(20);
  for (const banned of [".houston", ".assistant", "JSON", "HTTP", "schema"]) {
    expect(rules).not.toContain(banned);
  }
});

test("coordinator owns secure integration and provider setup", () => {
  const rules = buildAssistantRulesSection("coordinator") ?? "";
  for (const tool of [
    "request_connection",
    "request_credential",
    "request_provider_connection",
  ])
    expect(rules).toContain(tool);
  expect(rules).toContain("never delegate connection setup to an agent");
  expect(rules).toContain("Never collect credentials or sign-in codes in chat");
});

test("work that needs the person's own hands is handed over, never narrated", () => {
  const rules = buildAssistantRulesSection("coordinator") ?? "";
  expect(rules).toContain("request_hands_on");
  expect(rules).toContain("needs the person's own hands");
  expect(rules).toContain("never describe the steps in chat");
  expect(rules).toContain("the only route any of that takes");
  expect(rules).toContain("the steps never belong in chat");
});

test("the capability list is read as this deployment's own, not Houston's in general", () => {
  const rules = buildAssistantRulesSection("coordinator") ?? "";
  expect(rules).toContain(
    "houston_capabilities lists only what THIS app can do",
  );
  expect(rules).toContain(
    "anything it does not return is something this app cannot do",
  );
});

const SERVED = {};
const DESKTOP = {
  HOUSTON_ASSISTANT_UNSERVED: "listApiKeys,createApiKey,revokeApiKey",
};
const rulesOn = (env: NodeJS.ProcessEnv): string =>
  (buildAssistantRulesSection("coordinator", env) ?? "").split(
    RULES_HEADING,
  )[1] ?? "";

test("connecting an employee to the person's own code happens right in the chat", () => {
  const rules = rulesOn(SERVED);
  expect(rules).toContain("through the Houston API");
  expect(rules).toContain("another AI agent or assistant");
  expect(rules).toContain(
    "unless they say they already have an API key, call request_hands_on with apiKeys first",
  );
  expect(rules).toContain(
    "that card lets them create and copy a key right in this chat, and you never see it",
  );
  expect(rules).toContain(
    "then with agentApiAccess and that employee's id from listAgents as agent",
  );
  expect(rules).toContain(
    "that card shows the employee's Agent ID, Organization ID and a ready prompt for their AI agent, right in this chat",
  );
  expect(rules).toContain("Never write that prompt yourself");
  expect(rules).toContain(
    "when listAgents gives their access to that employee as anything but manager, tell them to ask that employee's manager instead",
  );
  expect(rules).toContain("https://gethouston.ai/developers");
  expect(rules).toContain(
    "Never create, show, ask for or relay an API key in chat",
  );
});

test("the API is the one named exception to keeping things non-technical", () => {
  const rules = rulesOn(SERVED);
  expect(rules).toContain(
    "This is the one exception to keeping things non-technical",
  );
  expect(rules).toContain(
    "the Agent ID is the id listAgents returns, the Organization ID is the slug getOrg returns",
  );
  expect(rules).toContain("when a technical person asks how the API works");
  for (const concept of [
    "Authorization header",
    "x-houston-org",
    "REST",
    "MCP",
    "A2A",
  ])
    expect(rules).toContain(concept);
});

test("a deployment without the API never hears of it", () => {
  const rules = rulesOn(DESKTOP);
  expect(rules).not.toContain("Houston API");
  expect(rules).not.toContain("agentApiAccess");
  expect(rules).not.toContain("x-houston-org");
  expect(rules).toContain("not technical");
  expect(rules).toContain("request_hands_on");
  expect(rulesOn({ HOUSTON_ASSISTANT_UNSERVED: "createOrg" })).toContain(
    "agentApiAccess",
  );
});

test("no other company's product is named to the person", () => {
  for (const env of [SERVED, DESKTOP])
    for (const name of ["Claude Code", "Cursor", "ChatGPT", "Codex"])
      expect(rulesOn(env)).not.toContain(name);
});
