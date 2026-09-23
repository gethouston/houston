import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const view = read("../src/components/skills-view/skills-view.tsx");
const editorPage = read("../src/components/skills-view/skill-editor-page.tsx");
const editor = read("../src/components/skills-view/use-skill-editor.ts");
const addExisting = read(
  "../src/components/skills-view/use-add-existing-skill.tsx",
);
const chatPane = read("../src/components/skills-view/skill-chat-pane.tsx");
const chatOpen = read("../src/components/skills-view/use-skill-chat-open.ts");
const sharedActions = read(
  "../src/components/skills-view/use-shared-skills-actions.ts",
);
const scopedActions = read(
  "../src/components/skills-view/scoped-skill-actions.ts",
);
const scopedActs = read(
  "../src/components/skills-view/use-scoped-skill-acts.ts",
);
const confirms = read(
  "../src/components/skills-view/skill-editor-confirms.tsx",
);

/**
 * The node runner has no DOM, so the wiring these rules ride on is guarded at
 * the source (the repo's React-test idiom). Each pin names the pure decision
 * the surface must go through, so the decision cannot be re-made inline.
 */
describe("an AI Employee's own Skills section", () => {
  it("edits the copy that employee runs, not the workspace original", () => {
    ok(
      view.includes("useScopedSkillRows("),
      "the rows resolve an override to the employee's own copy",
    );
    ok(
      editorPage.includes("<SkillOverrideNotice"),
      "and the editor says which version is open",
    );
    ok(
      editorPage.includes("scoped.useWorkspaceVersion"),
      "with the one way back onto the workspace version",
    );
  });

  it("says so too when the open skill IS the workspace version", () => {
    // Saving there rewrites the skill for every employee, which the screen has
    // to state before the user types, not after.
    ok(scopedActions.includes('notice: override ? "override" : "workspace"'));
    ok(editorPage.includes("kind={scoped.notice}"));
  });

  it("disables a workspace skill by dropping the copy with the entry", () => {
    // Clearing the manifest alone is a no-op: a local copy loads whether or
    // not the manifest names it. The two writes and the order they happen in
    // are ONE capability, so the hook delegates rather than sequencing them.
    ok(sharedActions.includes("const disableForAgent = useCallback("));
    ok(
      sharedActions.includes(
        "tauriSkillsManifest.disableForAgent(agent.folderPath, row.slug)",
      ),
      "the shadowing copy goes with the entry, in the SDK's order",
    );
    ok(
      sharedActions.includes(
        "tauriSkillsManifest.revertOverride(agent.folderPath, row.slug)",
      ),
      "and going back to the workspace version is the same one act",
    );
  });

  it("refreshes what the act moved even when the act failed partway", () => {
    // The manifest entry can land and the copy delete fail after it, so a
    // refresh that only follows success leaves every cache one write behind.
    const rides = (call: string) =>
      new RegExp(String.raw`actThenRefresh\(\s*\(\) =>\s*${call}`).test(
        sharedActions,
      );
    ok(rides(String.raw`tauriSkillsManifest\.disableForAgent`));
    ok(rides(String.raw`tauriSkillsManifest\.revertOverride`));
  });

  it("never offers the workspace-wide promote from inside one employee", () => {
    ok(editor.includes("offersPromoteToWorkspace({"));
    ok(editor.includes("scopedAgentId: scopedAgent?.id ?? null"));
  });

  it("offers the add only where a workspace store can answer it", () => {
    ok(addExisting.includes("offersAddExisting({"));
    ok(addExisting.includes("sharedStore: shared !== undefined"));
  });

  it("feeds the chat what the employee RUNS, copies and workspace alike", () => {
    ok(view.includes("effectiveSkillsByPath({"));
    ok(view.includes("skillsByPath,"), "the create flow takes that list");
  });
});

describe("an unfinished creation chat", () => {
  it("is picked back up instead of stranded behind a second one", () => {
    ok(chatOpen.includes("resolveCreateChatStart({"));
    ok(
      chatOpen.includes("resumeDraft(start.activityId)"),
      "resume has a caller",
    );
  });

  it("keeps a way to throw it away and start over", () => {
    ok(chatPane.includes("discardDraftThenRestart({"));
    ok(chatPane.includes("startNew: () => void startCreate(),"));
  });

  it("is listed as its own row above the employee's skills", () => {
    ok(view.includes("useUnfinishedSkillDrafts("));
    ok(
      view.includes(
        "<SkillDraftRows drafts={drafts} onOpen={create.openDraft}",
      ),
    );
  });
});

describe("the skill editor's dirty draft", () => {
  it("guards every way out with the same confirm, not just the back arrow", () => {
    ok(editorPage.includes("const guard = (run: () => void) => {"));
    ok(editorPage.includes("onBack={() => guard(onBack)}"));
    ok(editorPage.includes("guard,"), "and the scoped acts are handed it");
  });

  it("takes every scoped act out of the editor through one runner", () => {
    // BOTH acts change which copy the editor writes to: left on screen, the
    // typed draft would be saved into the OTHER copy. One runner is what makes
    // "ask, then act, then leave" true of all of them at once.
    ok(scopedActs.includes("scopedSkillActions("), "the rules are read once");
    ok(scopedActs.includes("runScopedAct("), "and every act runs through it");
    ok(scopedActs.includes("guard("), "the draft confirm is still in the way");
    ok(
      !/\bshared\./.test(scopedActs),
      "no act reaches a store handler around the runner",
    );
  });

  it("asks before an act deletes this employee's own version", () => {
    // The draft confirm speaks of unsaved text, and "Disable for this AI
    // Employee" reads as reversible: neither says the employee's own version
    // of the skill is what goes.
    ok(scopedActs.includes("if (act.destroysOwnVersion) setConfirming(act);"));
    ok(scopedActions.includes("destroysOwnVersion: override"));
    ok(editorPage.includes("scopedAct={scoped.confirming}"));
    ok(confirms.includes("global.scopedOverride.disableConfirmTitle"));
    ok(confirms.includes("global.scopedOverride.revertConfirmTitle"));
  });

  it("binds each act's completion to the editor that started it", () => {
    // A finished act calls the SHARED way out: taken after the user opened
    // another skill, it discards that skill's draft.
    ok(scopedActs.includes("isLive: () => live.current"));
    ok(scopedActs.includes("isPending: () => pendingRef.current"));
  });
});
