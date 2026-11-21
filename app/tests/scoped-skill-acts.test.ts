import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import * as surface from "../src/components/skills-view/scoped-skill-actions.ts";
import {
  runScopedAct,
  type ScopedSkillAct,
  scopedSkillActions,
} from "../src/components/skills-view/scoped-skill-actions.ts";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "../src/components/skills-view/skill-editor-props.ts";
import type { Agent, SkillSummary } from "../src/lib/types.ts";

const ANA: Agent = {
  id: "ana",
  name: "Ana",
  folderPath: "/w/Ana",
} as Agent;

const summary = (name: string): SkillSummary => ({
  name,
  title: name,
  description: "",
  version: 1,
  tags: [],
  created: null,
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  inputs: [],
  prompt_template: null,
});

const holder = { id: "ana", name: "Ana", folderPath: "/w/Ana" };

const row = (over: Partial<ManagedSkillRow>): ManagedSkillRow => ({
  slug: "invoices",
  summary: summary("invoices"),
  agents: [holder],
  ...over,
});

function sharedStub(): { shared: SharedDialogActions; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    shared: {
      workspaceId: "w",
      onApply: async () => {},
      onDelete: async () => {},
      onRevert: async () => void calls.push("revert"),
      onDisableForAgent: async () => void calls.push("disable"),
      onEnableAll: async () => {},
      onAddToAgent: async () => {},
      onPromote: async () => {},
    },
  };
}

describe("the acts an employee's own Skills section offers", () => {
  it("says both delete this employee's own version when it keeps one", () => {
    const { shared } = sharedStub();
    const acts = scopedSkillActions({
      row: row({ origin: "local", overriddenBy: [holder] }),
      scopedAgent: ANA,
      shared,
      isShared: false,
    });

    strictEqual(acts.notice, "override");
    strictEqual(acts.disable?.destroysOwnVersion, true);
    strictEqual(acts.revert?.destroysOwnVersion, true);
  });

  it("deletes nothing of this employee's when it runs the workspace copy", () => {
    const { shared } = sharedStub();
    const acts = scopedSkillActions({
      row: row({ origin: "shared", overriddenBy: [] }),
      scopedAgent: ANA,
      shared,
      isShared: true,
    });

    strictEqual(acts.notice, "workspace");
    strictEqual(acts.disable?.destroysOwnVersion, false);
    strictEqual(acts.revert, undefined);
  });

  it("runs each act against the employee the section stands on", async () => {
    const { shared, calls } = sharedStub();
    const acts = scopedSkillActions({
      row: row({ origin: "local", overriddenBy: [holder] }),
      scopedAgent: ANA,
      shared,
      isShared: false,
    });

    await acts.disable?.run();
    await acts.revert?.run();
    deepStrictEqual(calls, ["disable", "revert"]);
  });
});

function actRun(options: {
  run?: () => Promise<void>;
  live?: boolean;
  pending?: boolean;
}) {
  const pending: boolean[] = [];
  const reported: string[] = [];
  let backs = 0;
  const act: ScopedSkillAct = {
    kind: "disable",
    command: "skill_disable_for_agent",
    destroysOwnVersion: false,
    run: options.run ?? (async () => {}),
  };
  return {
    pending,
    reported,
    backs: () => backs,
    go: () =>
      runScopedAct(act, {
        isLive: () => options.live !== false,
        isPending: () => options.pending === true,
        setPending: (next) => pending.push(next),
        onBack: () => {
          backs += 1;
        },
        report: (command) => void reported.push(command),
      }),
  };
}

describe("running one of those acts", () => {
  it("leaves the editor once the write has landed", async () => {
    const act = actRun({});

    await act.go();

    strictEqual(act.backs(), 1);
    deepStrictEqual(act.pending, [true, false]);
  });

  it("never steers a screen the editor it started in has left", async () => {
    const act = actRun({ live: false });

    await act.go();

    strictEqual(act.backs(), 0);
    deepStrictEqual(act.pending, [true]);
  });

  it("reports a failure and stays on the skill", async () => {
    const act = actRun({
      run: async () => {
        throw new Error("read-only");
      },
    });

    await act.go();

    strictEqual(act.backs(), 0);
    deepStrictEqual(act.reported, ["skill_disable_for_agent"]);
    deepStrictEqual(act.pending, [true, false]);
  });

  it("ignores a second press while the first is still writing", async () => {
    let runs = 0;
    const act = actRun({
      pending: true,
      run: async () => {
        runs += 1;
      },
    });

    await act.go();

    strictEqual(runs, 0);
    deepStrictEqual(act.pending, []);
  });
});

describe("what the acts module publishes", () => {
  it("keeps the override test to itself", () => {
    ok(!("isScopedOverride" in surface));
  });
});
