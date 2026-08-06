import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import {
  FIND_SKILLS_TOOL_NAME,
  INSTALL_SKILL_TOOL_NAME,
  makeFindSkillsTool,
  makeInstallSkillTool,
  SKILL_DIRECTORY_TOOL_NAMES,
} from "./find-skills";

/**
 * find_skills / install_skill are thin proxies to the host's /sandbox/skills/*
 * routes under the per-sandbox token. These pin: the URL + Authorization header,
 * that a host rejection surfaces as a tool error the agent can relay (never a
 * silent empty result), that an empty directory answer steers the agent to a
 * real alternative rather than a dead end, and that a successful install hands
 * back the path — the session's skill index was built at session start, so a
 * mid-turn install is invisible to the model without it.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  auth?: string;
  body: unknown;
}

function mockFetch(reply: () => { status?: number; body?: unknown }) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      auth: headers.authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = reply();
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const OPTS = { baseUrl: "http://host/", sandboxToken: "sb-token" };
const find = makeFindSkillsTool(OPTS);
const install = makeInstallSkillTool(OPTS);
const CTX = {} as ExtensionContext;

const HIT = {
  skillId: "web-design-guidelines",
  source: "vercel-labs/agent-skills",
  name: "web-design-guidelines",
  installs: 521246,
  description: "Review UI code against web interface guidelines",
};

function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content.map((c) => c.text ?? "").join("");
}

test("both tools are named in the shared directory tool list", () => {
  expect(SKILL_DIRECTORY_TOOL_NAMES).toEqual([
    FIND_SKILLS_TOOL_NAME,
    INSTALL_SKILL_TOOL_NAME,
  ]);
  expect(find.name).toBe(FIND_SKILLS_TOOL_NAME);
  expect(install.name).toBe(INSTALL_SKILL_TOOL_NAME);
});

test("find_skills posts the query to the sandbox route under the sandbox token", async () => {
  const calls = mockFetch(() => ({ body: { skills: [HIT] } }));
  const result = await find.execute(
    "call-1",
    { query: "design review" },
    undefined,
    undefined,
    CTX,
  );
  expect(calls).toHaveLength(1);
  // No double slash: the trailing slash on baseUrl is trimmed.
  expect(calls[0].url).toBe("http://host/sandbox/skills/search");
  expect(calls[0].auth).toBe("Bearer sb-token");
  expect(calls[0].body).toEqual({ query: "design review" });
  // The candidates reach the model verbatim so it can judge on description
  // and install count, and it is told to ask before installing.
  expect(text(result)).toContain("web-design-guidelines");
  expect(text(result)).toContain("521246");
  expect(text(result)).toContain("ask whether to add it");
});

test("an empty directory answer steers the agent to an alternative, not a dead end", async () => {
  mockFetch(() => ({ body: { skills: [] } }));
  const result = await find.execute(
    "call-1",
    { query: "nothing like this exists" },
    undefined,
    undefined,
    CTX,
  );
  expect(text(result)).toContain("No published skill matches");
  expect(text(result)).toContain("do the task directly");
});

test("a rate-limited directory surfaces the host's reason as a tool error", async () => {
  mockFetch(() => ({ status: 429, body: { error: "skills.sh is busy" } }));
  await expect(
    find.execute("call-1", { query: "design" }, undefined, undefined, CTX),
  ).rejects.toThrow(/find_skills failed \(429\).*skills\.sh is busy/s);
});

test("install_skill posts the exact source + skillId and returns the readable path", async () => {
  const calls = mockFetch(() => ({
    status: 201,
    body: {
      slug: "web-design-guidelines",
      path: ".agents/skills/web-design-guidelines/SKILL.md",
    },
  }));
  const result = await install.execute(
    "call-2",
    { source: HIT.source, skillId: HIT.skillId },
    undefined,
    undefined,
    CTX,
  );
  expect(calls[0].url).toBe("http://host/sandbox/skills/install");
  expect(calls[0].auth).toBe("Bearer sb-token");
  expect(calls[0].body).toEqual({
    source: "vercel-labs/agent-skills",
    skillId: "web-design-guidelines",
  });
  // The mid-turn escape hatch: the session's skill index predates this install.
  expect(text(result)).toContain(
    ".agents/skills/web-design-guidelines/SKILL.md",
  );
  expect(result.details).toEqual({
    slug: "web-design-guidelines",
    path: ".agents/skills/web-design-guidelines/SKILL.md",
  });
});

test("an install rejection surfaces the host's reason instead of a false success", async () => {
  mockFetch(() => ({
    status: 503,
    body: { error: "agent data not configured" },
  }));
  await expect(
    install.execute(
      "call-2",
      { source: "a/b", skillId: "c" },
      undefined,
      undefined,
      CTX,
    ),
  ).rejects.toThrow(/install_skill failed \(503\).*agent data not configured/s);
});
