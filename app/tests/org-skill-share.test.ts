import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isOrgSkillShareDeclined,
  type OrgSkillShareDeps,
  shareNewSkillToWorkspace,
} from "../src/lib/org-skill-share.ts";

// HOU-1192: a skill created with an agent lands in the workspace store by
// default. The flow must never lose the skill: every failure path leaves it
// usable somewhere, and the local copy dies only when the creator can already
// load the shared one and nothing diverged.

/** The shape `HoustonEngineError` carries: the status plus the parsed body. */
const engineError = (status: number, body: unknown = null) => ({
  status,
  body,
});

const ARGS = {
  workspaceId: "ws1",
  creatorPath: "/ws/Creator",
  agentPaths: ["/ws/Creator", "/ws/Other", "/ws/Third"],
  slug: "meeting-prep",
};

/** Recording fake: every dep resolves and appends to `calls`. */
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
    // Route absent (pre-shared-skills deployment) = feature absence, the
    // HOU-1105 rule — the share is attempted before capabilities resolve.
    strictEqual(isOrgSkillShareDeclined(engineError(404)), true);
    strictEqual(
      isOrgSkillShareDeclined(
        engineError(503, { error: "shared skills not configured" }),
      ),
      true,
    );
    // A plain 503 (pod waking, real outage) is NOT a decline.
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
  it("happy path: promote, creator first, fan-out, byte-identical delete", async () => {
    const { calls, deps } = makeDeps();
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      enableFailures: [],
      localDeleted: true,
    });
    // Ordering: load → promote → creator enable → others → beforeDelete
    // (cache refresh) → reload → delete, with the reload/compare directly
    // against the delete so a concurrent edit has the narrowest window.
    deepStrictEqual(calls, [
      "load:/ws/Creator:meeting-prep",
      "promote:ws1:meeting-prep",
      "enable:/ws/Creator:meeting-prep",
      "enable:/ws/Other:meeting-prep",
      "enable:/ws/Third:meeting-prep",
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
      if (path === "/ws/Creator") throw new Error("manifest write failed");
    };
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      enableFailures: ["/ws/Creator"],
      localDeleted: false,
    });
    strictEqual(
      calls.some((c) => c.startsWith("delete:")),
      false,
    );
  });

  it("other agents' enable failures are collected, never fatal", async () => {
    const { deps } = makeDeps();
    deps.enable = async (path) => {
      if (path === "/ws/Other") throw new Error("forbidden");
    };
    const result = await shareNewSkillToWorkspace(deps, ARGS);
    deepStrictEqual(result, {
      outcome: "shared",
      enableFailures: ["/ws/Other"],
      localDeleted: true,
    });
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
      enableFailures: [],
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
      enableFailures: [],
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
      enableFailures: [],
      localDeleted: false,
    });
  });
});
