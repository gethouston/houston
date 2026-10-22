import { composeSkillMd } from "@houston/domain";
import { describe, expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { SkillTransferCommand } from "./transfer-types";

const CONTENT =
  "---\nname: triage\ntitle: Triage\nintegrations: [gmail]\n---\nSort messages.\n";
const SHARED = "/v1/workspaces/ws/shared-skills/triage";
const LOCAL = "/agents/a/skills/triage";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function fixture() {
  const state = {
    activeWorkspaceId: null as string | null,
    wireWorkspaceId: "ws",
    orgRole: "owner",
    orgSlug: "team",
    shared: CONTENT as string | null,
    local: null as string | null,
    enabled: { a: ["other", "triage"], b: [] } as Record<string, string[]>,
    fail: "",
    failureStatus: 500,
    failureError: "disk unavailable",
    before: (_step: string) => {},
  };
  const calls: { step: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      const step = `${method} ${path}`;
      const body: unknown =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ step, body });
      state.before(step);
      if (state.fail === step)
        return json({ error: state.failureError }, state.failureStatus);
      if (path === "/v1/org")
        return json({ slug: state.orgSlug, role: state.orgRole });
      if (path === "/agents")
        return json([
          { id: "a", workspaceId: state.wireWorkspaceId },
          { id: "b", workspaceId: state.wireWorkspaceId },
          ...(state.activeWorkspaceId
            ? []
            : [{ id: "outside", workspaceId: "elsewhere" }]),
        ]);
      const manifest = path.match(/^\/agents\/(a|b)\/skills-manifest$/)?.[1];
      if (manifest) {
        if (
          method === "PUT" &&
          body &&
          typeof body === "object" &&
          "enabled" in body
        ) {
          state.enabled[manifest] = body.enabled as string[];
        }
        return json({ version: 1, enabled: state.enabled[manifest] });
      }
      const detail = (content: string | null) =>
        content === null
          ? json({ error: "skill not found" }, 404)
          : json({
              name: "triage",
              title: "Triage",
              description: "Sort messages",
              version: 1,
              content,
            });
      if (path.endsWith("/shared-skills/triage")) {
        if (method === "POST") {
          if (state.shared !== null)
            return json({ error: "already exists" }, 409);
          state.shared = (body as { content: string }).content;
        }
        if (method === "DELETE") {
          state.shared = null;
          return json({ ok: true });
        }
        return detail(state.shared);
      }
      if (path === "/agents/a/skills" && method === "POST") {
        if (state.local !== null) return json({ error: "already exists" }, 409);
        state.local = composeSkillMd({
          ...(body as { name: string; description: string; content: string }),
          createdIsoDate: "2026-10-22",
        });
        return detail(state.local);
      }
      if (path === LOCAL) {
        if (method === "PUT")
          state.local = (body as { content: string }).content;
        if (method === "DELETE") {
          state.local = null;
          return json({ ok: true });
        }
        return detail(state.local);
      }
      throw new Error(`unexpected request ${step}`);
    },
  );
  const sdk = new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: fetchImpl,
      activeWorkspaceId: () => state.activeWorkspaceId,
      storage: memoryKv(),
      devicePreferences: memoryKv(),
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  });
  const keep = () => sdk.skills.keepSharedSkillForAgent("ws", "a", "triage");
  const share = () => sdk.skills.shareNewSkillToWorkspace("ws", "a", "triage");
  return { state, calls, sdk, keep, share };
}

describe("keeping a shared skill on one employee", () => {
  it("preserves all content, enables the employee, and deletes the store copy last", async () => {
    const { state, calls, keep } = fixture();
    state.enabled.a = ["other"];
    await keep();
    expect(state.local).toBe(CONTENT);
    expect(state.shared).toBeNull();
    expect(state.enabled.a).toEqual(["other", "triage"]);
    expect(state.enabled.b).toEqual([]);
    expect(calls.at(-1)?.step).toBe(`DELETE ${SHARED}`);
    expect(calls.filter((c) => c.step.startsWith("PUT"))).toEqual([
      { step: `PUT ${LOCAL}`, body: { content: CONTENT } },
      {
        step: "PUT /agents/a/skills-manifest",
        body: { version: 1, enabled: ["other", "triage"] },
      },
    ]);
  });
  it("refuses even one different enabled employee without writing", async () => {
    const { state, calls, keep } = fixture();
    state.enabled.a = [];
    state.enabled.b = ["triage"];
    await expect(keep()).rejects.toMatchObject({ reason: "enabled_elsewhere" });
    expect(calls.every((c) => c.step.startsWith("GET"))).toBe(true);
  });
  it("refuses an existing divergent override without overwriting it", async () => {
    const { state, keep } = fixture();
    state.local = "my version";
    await expect(keep()).rejects.toMatchObject({ reason: "local_copy_exists" });
    expect(state.local).toBe("my version");
    expect(state.shared).toBe(CONTENT);
  });
  it("can finish after the final delete failed", async () => {
    const { state, keep } = fixture();
    state.fail = `DELETE ${SHARED}`;
    await expect(keep()).rejects.toMatchObject({ status: 500 });
    state.fail = "";
    await keep();
    expect(state.local).toBe(CONTENT);
    expect(state.shared).toBeNull();
  });
  it.each([
    "GET /agents/b/skills-manifest",
    `GET ${SHARED}`,
    `GET ${LOCAL}`,
    "POST /agents/a/skills",
    `PUT ${LOCAL}`,
    "PUT /agents/a/skills-manifest",
    `DELETE ${SHARED}`,
  ])("keeps the store copy and reports failure at %s", async (step) => {
    const { state, keep } = fixture();
    state.fail = step;
    await expect(keep()).rejects.toMatchObject({ status: 500 });
    expect(state.shared).toBe(CONTENT);
  });
  it("rechecks other employees before deleting", async () => {
    const { state, keep } = fixture();
    state.before = (step) => {
      if (step === "PUT /agents/a/skills-manifest")
        state.enabled.b = ["triage"];
    };
    await expect(keep()).rejects.toMatchObject({ reason: "enabled_elsewhere" });
    expect(state.shared).toBe(CONTENT);
    expect(state.local).toBe(CONTENT);
  });
  it("retains a shared version edited while the local copy was written", async () => {
    const { state, keep } = fixture();
    state.before = (step) => {
      if (step === `PUT ${LOCAL}`) state.shared = "new version";
    };
    await expect(keep()).rejects.toMatchObject({ reason: "skill_changed" });
    expect(state.shared).toBe("new version");
    expect(state.local).toBe(CONTENT);
  });
  it("dispatches the same capability", async () => {
    const { state, sdk } = fixture();
    expect(
      (
        await sdk.dispatch({
          id: "keep",
          type: SkillTransferCommand.KeepForAgent,
          payload: { workspaceId: "ws", agentId: "a", slug: "triage" },
        })
      ).ok,
    ).toBe(true);
    expect(state.shared).toBeNull();
  });
});

describe("sharing a newly created skill", () => {
  it("promotes, enables the creator, refreshes, compares then deletes", async () => {
    const { state, calls, sdk } = fixture();
    state.shared = null;
    state.local = CONTENT;
    await sdk.skills.shareNewSkillToWorkspace("ws", "a", "triage", {
      beforeDelete: async () => {
        expect(state.enabled.a).toContain("triage");
        expect(state.shared).toBe(CONTENT);
        expect(state.local).toBe(CONTENT);
        calls.push({ step: "refresh", body: null });
      },
    });
    expect(state.local).toBeNull();
    expect(state.shared).toBe(CONTENT);
    expect(state.enabled.b).toEqual([]);
    expect(calls.slice(-3).map((c) => c.step)).toEqual([
      "refresh",
      `GET ${LOCAL}`,
      `DELETE ${LOCAL}`,
    ]);
  });
  it("keeps a concurrent local edit", async () => {
    const { state, sdk } = fixture();
    state.shared = null;
    state.local = CONTENT;
    expect(
      await sdk.skills.shareNewSkillToWorkspace("ws", "a", "triage", {
        beforeDelete: async () => {
          state.local = "edited";
        },
      }),
    ).toMatchObject({ localDeleted: false });
    expect(state.local).toBe("edited");
  });
  it.each([
    `POST ${SHARED}`,
    "PUT /agents/a/skills-manifest",
    `DELETE ${LOCAL}`,
  ])("reports a failed %s without losing the skill", async (step) => {
    const { state, share } = fixture();
    state.shared = null;
    state.local = CONTENT;
    state.fail = step;
    await expect(share()).rejects.toMatchObject({ status: 500 });
    expect(state.local).toBe(CONTENT);
  });
  it("keeps a collision local and skips a missing local copy", async () => {
    const { state, share } = fixture();
    state.local = "different local";
    expect(await share()).toEqual({ outcome: "kept-local" });
    expect(state.local).toBe("different local");
    state.local = null;
    expect(await share()).toEqual({ outcome: "skipped" });
  });
  it("applies the default to SDK createSkill too", async () => {
    const { state, sdk } = fixture();
    state.shared = null;
    await sdk.skills.agent.createSkill("a", {
      name: "Triage",
      description: "Sort messages",
      content: "Sort messages.",
    });
    expect(state.shared).toContain("Sort messages.");
    expect(state.local).toBeNull();
  });
});

describe("sharing defaults and expected refusals", () => {
  it.each([
    403, 404, 409, 503,
  ])("keeps the local skill when the store declines with %s", async (status) => {
    const { state, share } = fixture();
    state.shared = null;
    state.local = CONTENT;
    state.fail = `POST ${SHARED}`;
    state.failureStatus = status;
    state.failureError = "shared skills not configured";
    await expect(share()).resolves.toEqual({ outcome: "kept-local" });
    expect(state.local).toBe(CONTENT);
    expect(state.shared).toBeNull();
  });
  it("reports an unrelated 503", async () => {
    const { state, share } = fixture();
    state.shared = null;
    state.local = CONTENT;
    state.fail = `POST ${SHARED}`;
    state.failureStatus = 503;
    await expect(share()).rejects.toMatchObject({ status: 503 });
    expect(state.local).toBe(CONTENT);
  });
  it("deduplicates observers in the SDK, with one shared result", async () => {
    const { state, share, calls } = fixture();
    state.shared = null;
    state.local = CONTENT;
    const results = await Promise.all([share(), share()]);
    expect(results.map((result) => result.outcome)).toEqual([
      "shared",
      "skipped",
    ]);
    expect(calls.filter((call) => call.step === `POST ${SHARED}`)).toHaveLength(
      1,
    );
  });
  it("reports a cache refresh failure without deleting the local copy", async () => {
    const { state, sdk } = fixture();
    state.shared = null;
    state.local = CONTENT;
    await expect(
      sdk.skills.shareNewSkillToWorkspace("ws", "a", "triage", {
        beforeDelete: async () => {
          throw new Error("refresh failed");
        },
      }),
    ).rejects.toThrow("refresh failed");
    expect(state.local).toBe(CONTENT);
    expect(state.shared).toBe(CONTENT);
  });
});

describe("cloud workspace identity and roster visibility", () => {
  it("keeps an org store skill even though its agents report the internal Houston workspace", async () => {
    const { state, sdk } = fixture();
    state.activeWorkspaceId = "org:team";
    state.wireWorkspaceId = "Houston";
    await sdk.skills.keepSharedSkillForAgent("org:team", "a", "triage");
    expect(state.local).toBe(CONTENT);
    expect(state.shared).toBeNull();
  });
  it("uses the active workspace for SDK creation defaults", async () => {
    const { state, sdk, calls } = fixture();
    state.activeWorkspaceId = "org:team";
    state.wireWorkspaceId = "Houston";
    state.shared = null;
    await sdk.skills.agent.createSkill("a", {
      name: "Triage",
      description: "Sort",
      content: "Sort messages.",
    });
    expect(
      calls.some(
        (call) =>
          call.step === "POST /v1/workspaces/org%3Ateam/shared-skills/triage",
      ),
    ).toBe(true);
    expect(state.shared).toContain("Sort messages.");
    expect(state.local).toBeNull();
  });
  it("refuses a partial admin roster without writing", async () => {
    const { state, sdk, calls } = fixture();
    state.orgRole = "admin";
    await expect(
      sdk.skills.keepSharedSkillForAgent("org:team", "a", "triage"),
    ).rejects.toMatchObject({ reason: "workspace_not_owned" });
    expect(calls.map((call) => call.step)).toEqual(["GET /v1/org"]);
  });
  it("refuses a different active org without writing", async () => {
    const { sdk, calls } = fixture();
    await expect(
      sdk.skills.keepSharedSkillForAgent("org:other", "a", "triage"),
    ).rejects.toMatchObject({ reason: "agent_not_in_workspace" });
    expect(calls.map((call) => call.step)).toEqual(["GET /v1/org"]);
  });
});
