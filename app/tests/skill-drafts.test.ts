import { ok } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");
const has = (rel: string) => existsSync(new URL(rel, import.meta.url));

/**
 * The unfinished-creation-chat policy is the SDK's (`@houston/sdk/skill-drafts`,
 * covered by its own vitest): every surface — desktop, iOS, the AI Manager —
 * answers "resume or start fresh", "which rows", "what discarding means" the
 * same way. These pins guard the one thing a unit test of the rules cannot:
 * that this surface CALLS them instead of keeping its own copy.
 */

const draftsHook = read(
  "../src/components/skills-view/use-unfinished-skill-drafts.ts",
);
const chatOpen = read("../src/components/skills-view/use-skill-chat-open.ts");
const chatPane = read("../src/components/skills-view/skill-chat-pane.tsx");
const chatSetupLib = read("../src/lib/skill-chat-setup.ts");
const draftRows = read("../src/components/skills-view/skill-draft-rows.tsx");

const importsFromSdk = (source: string, name: string) =>
  new RegExp(
    `import\\s*{[^}]*\\b${name}\\b[^}]*}\\s*from\\s*"@houston/sdk/skill-drafts"`,
    "s",
  ).test(source);

describe("the draft rules the Skills surface runs on", () => {
  it("keeps no second copy in the surface", () => {
    ok(!has("../src/components/skills-view/skill-drafts.ts"));
  });

  it("takes the resume decision from the SDK", () => {
    ok(importsFromSdk(chatOpen, "resolveCreateChatStart"));
    ok(importsFromSdk(chatOpen, "resolveDraftResume"));
  });

  it("takes the listed rows from the SDK", () => {
    ok(importsFromSdk(draftsHook, "unfinishedDraftRows"));
    ok(importsFromSdk(draftsHook, "findDraftSkillChatActivities"));
  });

  it("takes discarding from the SDK", () => {
    ok(importsFromSdk(chatPane, "discardDraftThenRestart"));
  });

  it("takes the setup-chat sentinel and its classification from the SDK", () => {
    ok(importsFromSdk(chatSetupLib, "SKILL_SETUP_AGENT_MODE"));
    ok(importsFromSdk(chatSetupLib, "findDraftSkillChatActivities"));
  });

  it("dates a row from the SDK's own reading of the chat's stamp", () => {
    ok(importsFromSdk(draftRows, "skillDraftLastWorkedAt"));
  });
});
