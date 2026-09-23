import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const chatPane = read("../src/components/skills-view/skill-chat-pane.tsx");
const chatOpen = read("../src/components/skills-view/use-skill-chat-open.ts");
const createFlow = read(
  "../src/components/skills-view/use-skill-create-flow.tsx",
);
const view = read("../src/components/skills-view/skills-view.tsx");
const ready = read("../src/components/skills-view/skills-ready.tsx");
const draftsHook = read(
  "../src/components/skills-view/use-unfinished-skill-drafts.ts",
);
const models = read("../src/components/skills-view/use-skills-models.ts");
const chatSetup = read("../src/components/agent/use-skill-chat-setup.ts");
const chatWrites = read("../src/components/agent/use-skill-chat-writes.ts");

/**
 * The node runner has no DOM, so the wiring these rules ride on is guarded at
 * the source (the repo's React-test idiom). Each pin names a decision helper
 * the surface must go through, so the decision cannot be re-made inline.
 */
describe("the create chat's resume decision", () => {
  it("is taken on real data, never on a cached placeholder", () => {
    ok(chatSetup.includes("activitiesSettled:"), "settledness is published");
    ok(chatPane.includes("settled: activitiesSettled && skills !== undefined"));
  });

  it("falls through to a fresh chat when a read failed", () => {
    ok(chatSetup.includes("activitiesFailed"));
    ok(chatPane.includes("failed: activitiesFailed || skillsFailed"));
    ok(view.includes("skillsFailed: models.failed"), "the surface supplies it");
  });

  it("only resumes where the unfinished chats are listed", () => {
    ok(chatOpen.includes("allowResume: initial.allowResume"));
    ok(
      createFlow.includes("allowResume: scopedAgent !== null"),
      "the library lists none, so it resumes none",
    );
  });

  it("stands on the opening surface while the decision is outstanding", () => {
    // `view.deselect` clears a selection that is not there yet, so the pane
    // dismisses ITSELF while nothing is selected.
    ok(chatPane.includes("useSkillChatOpen({"));
    ok(chatPane.includes("selected === null && deciding"));
  });
});

describe("reopening ONE named unfinished chat", () => {
  it("re-validates the row's id against the settled read", () => {
    ok(chatOpen.includes("resolveDraftResume({"));
    ok(chatPane.includes("onMissingDraft:"), "a chat that is gone closes");
  });
});

describe("throwing an unfinished chat away", () => {
  it("starts the replacement only once the archive settled", () => {
    ok(chatPane.includes("discardDraftThenRestart({"));
    ok(chatPane.includes("archive: () => archiveDraft(draftId)"));
    ok(chatWrites.includes("const archiveDraft = useCallback("));
  });
});

describe("the unfinished-chat rows", () => {
  it("stand above the counted section, not inside it", () => {
    const draftsAt = ready.indexOf("{drafts}");
    const shellAt = ready.indexOf("<CatalogShell");
    ok(draftsAt >= 0 && shellAt > draftsAt, "drafts render before the shell");
    ok(view.includes("installed={installed}"), "the count keeps its own rows");
  });

  it("wait for the same settled read the resume decision waits for", () => {
    ok(draftsHook.includes("unfinishedDraftRows({"));
    ok(draftsHook.includes("isPlaceholderData"), "a placeholder draws nothing");
  });

  it("leave out the chat open beside them", () => {
    ok(view.includes("create.openActivityId"));
    ok(createFlow.includes("onOpenActivityChange={setOpenActivityId}"));
  });
});

describe("retrying a failed skills read", () => {
  it("asks the workspace store only where the deployment serves one", () => {
    // An explicit refetch runs a disabled query too, so an ungated retry hits
    // the unsupported route and reports a second failure.
    ok(models.includes("if (sharedMode) sharedModel.retry();"));
  });
});
