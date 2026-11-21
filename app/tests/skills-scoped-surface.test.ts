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
const assignments = read(
  "../src/components/skills-view/use-shared-skill-assignments.ts",
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
    ok(scopedActions.includes('notice: override ? "override" : "workspace"'));
    ok(editorPage.includes("kind={scoped.notice}"));
  });

  it("disables a workspace skill by dropping the copy with the entry", () => {
    ok(sharedActions.includes("...useSharedSkillAssignments(workspaceId)"));
    ok(assignments.includes("const disableForAgent = useCallback("));
    ok(
      assignments.includes(
        "tauriSkillsManifest.disableForAgent(agent.folderPath, row.slug)",
      ),
      "the shadowing copy goes with the entry, in the SDK's order",
    );
    ok(
      assignments.includes(
        "tauriSkillsManifest.revertOverride(agent.folderPath, row.slug)",
      ),
      "and going back to the workspace version is the same one act",
    );
  });

  it("refreshes what the act moved even when the act failed partway", () => {
    ok(assignments.includes("optimisticWrite({"));
    ok(
      assignments.includes(
        "invalidate: skillWriteRefresh(a.agentPaths, workspaceId)",
      ),
    );
  });

  it("reads every employee only for the menu's acts that reach them all", () => {
    ok(view.includes("const agents = useMemo(() => [agent], [agent]);"));
    ok(view.includes("useSkillsModels(agents)"));
    ok(editorPage.includes("workspaceItems={"));
    ok(editorPage.includes("<WorkspaceSkillMenuItems"));
    ok(!editor.includes("offersPromoteToWorkspace"));
  });

  it("keeps the acts that reach every employee to the owner, and to full reads", () => {
    const menu = read(
      "../src/components/skills-view/workspace-skill-menu-items.tsx",
    );
    ok(menu.includes("const { manageWorkspaceSkills } = useSurfaceGates();"));
    ok(
      menu.includes(
        "manageWorkspaceSkills ? <WorkspaceActs {...props} /> : null",
      ),
    );
    ok(
      menu.includes("workspaceActsState({"),
      "nothing before every read lands",
    );
    ok(menu.includes("complete: models.complete"), "every read answered");
    const shared = read("../src/components/skills-view/use-shared-skills.ts");
    ok(
      shared.includes("!rosterSettled"),
      "an unsettled roster has not read the manifests yet",
    );
    ok(menu.includes("withCanonicalHolder(asShared, props.agent.id)"));
    ok(
      menu.includes("props.guard(() => {"),
      "share goes through the draft guard",
    );
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
    ok(scopedActs.includes("scopedSkillActions("), "the rules are read once");
    ok(scopedActs.includes("runScopedAct("), "and every act runs through it");
    ok(scopedActs.includes("guard("), "the draft confirm is still in the way");
    ok(
      !/\bshared\./.test(scopedActs),
      "no act reaches a store handler around the runner",
    );
  });

  it("asks before an act deletes this employee's own version", () => {
    ok(scopedActs.includes("if (act.destroysOwnVersion) setConfirming(act);"));
    ok(scopedActions.includes("destroysOwnVersion: override"));
    ok(editorPage.includes("scopedAct={scoped.confirming}"));
    ok(confirms.includes("global.scopedOverride.disableConfirmTitle"));
    ok(confirms.includes("global.scopedOverride.revertConfirmTitle"));
  });

  it("binds each act's completion to the editor that started it", () => {
    ok(scopedActs.includes("isLive: () => live.current"));
    ok(scopedActs.includes("isPending: () => pendingRef.current"));
  });
});
