import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isOrgSkillShareDeclined,
  type OrgSkillShareDeps,
  shareNewSkillToWorkspace,
} from "../src/lib/org-skill-share.ts";

const engineError = (status: number, body: unknown = null) => ({
  status,
  body,
});

const ARGS = {
  workspaceId: "ws1",
  creatorPath: "/ws/Creator",
  slug: "meeting-prep",
};

function makeDeps(overrides?: Partial<OrgSkillShareDeps>) {
  const calls: string[] = [];
  const deps: OrgSkillShareDeps = {
    loadLocalContent: async (path, slug) => {
      calls.push(`load:${path}:${slug}`);
      return "---\nname: meeting-prep\n---\nbody";
    },
    promote: async (ws, slug) => {
      calls.push(`promote:${ws}:${slug}`);
    },
    enable: async (path, slug) => {
      calls.push(`enable:${path}:${slug}`);
    },
    deleteLocal: async (path, slug) => {
      calls.push(`delete:${path}:${slug}`);
    },
    beforeDelete: async () => {
      calls.push("beforeDelete");
    },
    ...overrides,
  };
  return { calls, deps };
}

describe("isOrgSkillShareDeclined", () => {
  it("matches the expected declines and nothing else", () => {
    strictEqual(isOrgSkillShareDeclined(engineError(409)), true);
    strictEqual(isOrgSkillShareDeclined(engineError(403)), true);
    strictEqual(isOrgSkillShareDeclined(engineError(404)), true);
    strictEqual(
      isOrgSkillShareDeclined(
        engineError(503, { error: "shared skills not configured" }),
      ),
      true,
    );
    strictEqual(isOrgSkillShareDeclined(engineError(503, null)), false);
    strictEqual(
      isOrgSkillShareDeclined(engineError(503, { error: "boom" })),
      false,
    );
    strictEqual(isOrgSkillShareDeclined(engineError(500)), false);
    strictEqual(isOrgSkillShareDeclined(new Error("network down")), false);
    strictEqual(isOrgSkillShareDeclined(null), false);
    strictEqual(isOrgSkillShareDeclined("409"), false);
  });
});

describe("shareNewSkillToWorkspace", () => {
  it("happy path: promote, creator-only enable, byte-identical delete", async () => {
    const { calls, deps } = makeDeps();
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      creatorEnabled: true,
      localDeleted: true,
    });
    deepStrictEqual(calls, [
      "load:/ws/Creator:meeting-prep",
      "promote:ws1:meeting-prep",
      "enable:/ws/Creator:meeting-prep",
      "beforeDelete",
      "load:/ws/Creator:meeting-prep",
      "delete:/ws/Creator:meeting-prep",
    ]);
  });

  it("no local copy → skipped, nothing else touched", async () => {
    const { calls, deps } = makeDeps({
      loadLocalContent: async () => null,
    });
    deepStrictEqual(await shareNewSkillToWorkspace(deps, ARGS), {
      outcome: "skipped",
    });
    deepStrictEqual(calls, []);
  });

  it("store declines (collision / role / no store) → kept local, untouched", async () => {
    for (const err of [
      engineError(409),
      engineError(403),
      engineError(503, { error: "shared skills not configured" }),
    ]) {
      const { calls, deps } = makeDeps({
        promote: async () => {
          throw err;
        },
      });
      deepStrictEqual(await shareNewSkillToWorkspace(deps, ARGS), {
        outcome: "kept-local",
      });
      deepStrictEqual(calls, ["load:/ws/Creator:meeting-prep"]);
    }
  });

  it("unexpected promote failure rethrows for the caller's surfacing", async () => {
    const { deps } = makeDeps({
      promote: async () => {
        throw engineError(500);
      },
    });
    await rejects(() => shareNewSkillToWorkspace(deps, ARGS));
  });

  it("creator enable failure → no delete (the skill must exist somewhere)", async () => {
    const { calls, deps } = makeDeps();
    deps.enable = async (path, slug) => {
      calls.push(`enable:${path}:${slug}`);
      throw new Error("manifest write failed");
    };
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      creatorEnabled: false,
      localDeleted: false,
    });
    strictEqual(
      calls.some((c) => c.startsWith("delete:")),
      false,
    );
  });

  it("a copy the agent edited mid-flight survives as an override", async () => {
    let loads = 0;
    const { calls, deps } = makeDeps({
      loadLocalContent: async (path, slug) => {
        calls.push(`load:${path}:${slug}`);
        loads += 1;
        return loads === 1 ? "original" : "edited-mid-flight";
      },
    });
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      creatorEnabled: true,
      localDeleted: false,
    });
    strictEqual(
      calls.some((c) => c.startsWith("delete:")),
      false,
    );
  });

  it("local copy vanishing before the delete reads as deleted", async () => {
    let loads = 0;
    const { calls, deps } = makeDeps({
      loadLocalContent: async () => {
        loads += 1;
        return loads === 1 ? "original" : null;
      },
    });
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      creatorEnabled: true,
      localDeleted: true,
    });
    strictEqual(
      calls.some((c) => c.startsWith("delete:")),
      false,
    );
  });

  it("a failing delete resolves shared anyway (identical copy shadows)", async () => {
    const { deps } = makeDeps({
      deleteLocal: async () => {
        throw new Error("delete failed");
      },
    });
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      creatorEnabled: true,
      localDeleted: false,
    });
  });
});
