import type { IncomingMessage, ServerResponse } from "node:http";
import { skillKey } from "@houston/domain";
import type {
  CommunitySkill,
  CommunitySkillPreview,
  HoustonEvent,
} from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type { CredentialVault } from "../ports";
import { SkillRemoteError } from "../skills/remote-error";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { handleSandboxSkills, type SandboxSkillsDeps } from "./skills-sandbox";

/**
 * The runtime-facing skills-directory routes behind `find_skills` /
 * `install_skill` (PRODUCT-1238).
 *
 * The invariants under test:
 *  - The sandbox token is the ONLY authority, and it is checked before any
 *    search or write happens.
 *  - Search hits are enriched with real descriptions, and a preview that fails
 *    degrades that ONE hit instead of failing the whole answer — the agent still
 *    gets something to recommend.
 *  - An install lands in the CALLING agent's own tree (the token names it; the
 *    request body cannot), preserves the author's frontmatter, and emits
 *    SkillsChanged so the Skills tab updates without a refresh.
 */

const paths = new LocalPaths();
const OWNER = "alice";

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let agent: Agent;
let root: string;
let events: HoustonEvent[];

const vault: CredentialVault = {
  sandboxToken: () => "sb",
  validateSandboxToken: (token) =>
    token === "sb-good" ? { workspaceId: ws.id, agentId: agent.id } : null,
};

const HIT: CommunitySkill = {
  id: "vercel-labs/agent-skills/web-design-guidelines",
  skillId: "web-design-guidelines",
  name: "web-design-guidelines",
  installs: 521246,
  source: "vercel-labs/agent-skills",
};

const REMOTE_SKILL_MD = `---
name: web-design-guidelines
description: Review UI code against web interface guidelines
category: design
---

## Procedure
Check the interface against the guidelines.
`;

function preview(description: string): CommunitySkillPreview {
  return {
    title: null,
    description,
    image: null,
    category: null,
    tags: [],
    integrations: [],
    content: null,
  };
}

/** A fake IncomingMessage: an async byte stream carrying the JSON body. */
function fakeReq(body: unknown, headers: Record<string, string>) {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      if (buf.byteLength) yield buf;
    },
  } as unknown as IncomingMessage;
}

/** A fake ServerResponse capturing the status + JSON body `json()` writes. */
function fakeRes() {
  const captured: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

/** Serves any raw.githubusercontent SKILL.md lookup; 404s everything else. */
const githubFetch = (async (input: RequestInfo | URL) =>
  String(input).includes("raw.githubusercontent.com")
    ? new Response(REMOTE_SKILL_MD, { status: 200 })
    : new Response("not found", { status: 404 })) as typeof fetch;

async function call(
  route: "search" | "install",
  body: unknown,
  opts: { token?: string; deps?: Partial<SandboxSkillsDeps> } = {},
) {
  const { res, captured } = fakeRes();
  const path = `/sandbox/skills/${route}`;
  const handled = await handleSandboxSkills(
    {
      vault,
      store,
      vfs,
      paths,
      events: {
        emit: (_userId: string, event: HoustonEvent) => events.push(event),
      } as never,
      fetchImpl: githubFetch,
      directory: { search: async () => [HIT] },
      previews: { preview: async () => preview("Review UI code") },
      ...opts.deps,
    },
    "POST",
    path,
    new URL(`http://host${path}`),
    fakeReq(body, { authorization: `Bearer ${opts.token ?? "sb-good"}` }),
    res,
  );
  return { handled, ...captured };
}

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  ws = await store.getOrCreatePersonalWorkspace(OWNER);
  agent = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  root = paths.agentRoot(ws, agent);
});

test("a bad sandbox token is rejected before anything is searched", async () => {
  let searched = false;
  const r = await call(
    "search",
    { query: "design" },
    {
      token: "sb-bad",
      deps: {
        directory: {
          search: async () => {
            searched = true;
            return [];
          },
        },
      },
    },
  );
  expect(r.handled).toBe(true);
  expect(r.status).toBe(401);
  expect(searched).toBe(false);
});

test("an unrelated path is not handled", async () => {
  const { res } = fakeRes();
  const handled = await handleSandboxSkills(
    { vault, store, vfs, paths },
    "POST",
    "/sandbox/learnings/save",
    new URL("http://host/sandbox/learnings/save"),
    fakeReq({}, {}),
    res,
  );
  expect(handled).toBe(false);
});

test("an empty query is rejected", async () => {
  const r = await call("search", { query: "   " });
  expect(r.status).toBe(400);
});

test("search returns hits enriched with their real descriptions", async () => {
  const r = await call("search", { query: "design review" });
  expect(r.status).toBe(200);
  expect(r.body).toEqual({
    skills: [
      {
        skillId: "web-design-guidelines",
        source: "vercel-labs/agent-skills",
        name: "web-design-guidelines",
        installs: 521246,
        description: "Review UI code",
      },
    ],
  });
});

test("a hit whose preview fails still comes back, just without a description", async () => {
  const r = await call(
    "search",
    { query: "design" },
    {
      deps: {
        previews: {
          preview: async () => {
            throw new SkillRemoteError("skill_not_in_repo", "gone");
          },
        },
      },
    },
  );
  expect(r.status).toBe(200);
  expect(r.body).toEqual({
    skills: [
      {
        skillId: "web-design-guidelines",
        source: "vercel-labs/agent-skills",
        name: "web-design-guidelines",
        installs: 521246,
      },
    ],
  });
});

test("a rate-limited directory surfaces the typed reason, not an empty list", async () => {
  const r = await call(
    "search",
    { query: "design" },
    {
      deps: {
        directory: {
          search: async () => {
            throw new SkillRemoteError("rate_limited", "skills.sh is busy");
          },
        },
      },
    },
  );
  expect(r.status).toBe(429);
  expect(JSON.stringify(r.body)).toContain("skills.sh is busy");
});

test("install writes the skill into the calling agent's own tree", async () => {
  const r = await call("install", {
    source: "vercel-labs/agent-skills",
    skillId: "web-design-guidelines",
  });
  expect(r.status).toBe(201);
  expect(r.body).toEqual({
    slug: "web-design-guidelines",
    path: ".agents/skills/web-design-guidelines/SKILL.md",
  });

  const written = await vfs.readText(skillKey(root, "web-design-guidelines"));
  expect(written).toBeTruthy();
  // The author's frontmatter survives the install (composeInstalledSkillMd).
  expect(written).toContain("description: Review UI code against");
  expect(written).toContain("## Procedure");
});

test("install emits SkillsChanged so the Skills tab updates without a refresh", async () => {
  await call("install", {
    source: "vercel-labs/agent-skills",
    skillId: "web-design-guidelines",
  });
  expect(events).toEqual([{ type: "SkillsChanged", agentPath: agent.id }]);
});

test("installing the same skill twice is an idempotent success", async () => {
  const first = await call("install", {
    source: "vercel-labs/agent-skills",
    skillId: "web-design-guidelines",
  });
  const second = await call("install", {
    source: "vercel-labs/agent-skills",
    skillId: "web-design-guidelines",
  });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body).toEqual(first.body);
});

test("install requires both source and skillId", async () => {
  const r = await call("install", { source: "vercel-labs/agent-skills" });
  expect(r.status).toBe(400);
});

test("install without a workspace vfs answers the honest unavailable code", async () => {
  const { res, captured } = fakeRes();
  await handleSandboxSkills(
    { vault, store, paths },
    "POST",
    "/sandbox/skills/install",
    new URL("http://host/sandbox/skills/install"),
    fakeReq(
      { source: "a/b", skillId: "c" },
      { authorization: "Bearer sb-good" },
    ),
    res,
  );
  expect(captured.status).toBe(503);
  expect(captured.body).toMatchObject({ code: "agent_data_not_configured" });
});
