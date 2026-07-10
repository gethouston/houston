import { createServer, type Server } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { CloudPaths } from "../paths";
import { MemoryVfs } from "../vfs";
import { handleSkillsRemote } from "./skills-remote";

/**
 * The marketplace routes: skills.sh search/install + GitHub repo list/install
 * land under the same per-agent skills surface, write real SKILL.md files,
 * emit SkillsChanged, and answer typed `{error: {details: {kind}}}` bodies so
 * the Add Skills dialog renders plain-English error states.
 */

const ws = { id: "w1", ownerUserId: "alice" } as Workspace;
const agent = { id: "a1", workspaceId: "w1" } as Agent;
const paths = new CloudPaths();
const vfs = new MemoryVfs();
const events: HoustonEvent[] = [];

const RESEARCH_MD =
  "---\nname: research\ndescription: Deep research\n---\n\n# Research\n\nSteps.";

const outbound: typeof fetch = async (input) => {
  const url = String(input);
  if (url.startsWith("https://skills.sh/api/search"))
    return new Response(
      JSON.stringify({
        skills: [
          {
            id: "owner/repo/research",
            skillId: "research",
            name: "research",
            installs: 42,
            source: "owner/repo",
          },
        ],
      }),
    );
  if (url === "https://api.github.com/repos/owner/repo")
    return new Response("{}");
  if (url.includes("api.github.com/repos/owner/repo/git/trees/HEAD"))
    return new Response(
      JSON.stringify({
        tree: [{ path: "research/SKILL.md", type: "blob" }],
        truncated: false,
      }),
    );
  if (url.includes("raw.githubusercontent.com/owner/repo/HEAD/"))
    return url.includes("research/SKILL.md")
      ? new Response(RESEARCH_MD)
      : new Response("", { status: 404 });
  return new Response("", { status: 404 });
};

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const rest = (req.url ?? "").replace(/^\//, "");
    void handleSkillsRemote(
      vfs,
      paths,
      { workspace: ws, agent },
      req.method ?? "GET",
      rest,
      req,
      res,
      (e) => events.push(e),
      { fetchImpl: outbound },
    ).then((handled) => {
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const post = (path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("community search + popular answer skills.sh results", async () => {
  const search = await post("/skills/community/search", { query: "research" });
  expect(search.status).toBe(200);
  const hits = (await search.json()) as Array<{ skillId: string }>;
  expect(hits[0]?.skillId).toBe("research");

  const popular = await post("/skills/community/popular");
  expect(popular.status).toBe(200);
});

test("repo list + install write the skill and emit SkillsChanged", async () => {
  const list = await post("/skills/repo/list", {
    source: "https://github.com/owner/repo",
  });
  expect(list.status).toBe(200);
  const skills = (await list.json()) as Array<{ id: string; path: string }>;
  expect(skills[0]?.id).toBe("research");

  const install = await post("/skills/repo/install", {
    source: "owner/repo",
    skills,
  });
  expect(install.status).toBe(200);
  expect(await install.json()).toEqual(["research"]);

  const root = paths.agentRoot(ws, agent);
  const md = await vfs.readText(`${root}/.agents/skills/research/SKILL.md`);
  expect(md).toContain("featured: true");
  expect(events.some((e) => e.type === "SkillsChanged")).toBe(true);
});

test("community install resolves the skill and returns its slug", async () => {
  const res = await post("/skills/community/install", {
    source: "owner/repo",
    skillId: "research",
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toBe("research");
});

test("community preview serves read-only detail agent-scoped", async () => {
  const res = await post("/skills/community/preview", {
    source: "owner/repo",
    skillId: "research",
  });
  expect(res.status).toBe(200);
  const preview = (await res.json()) as { description: string };
  expect(preview.description).toBe("Deep research");
});

test("garbage repo input answers a typed invalid_repo_source", async () => {
  const res = await post("/skills/repo/list", { source: "reconciliation" });
  expect(res.status).toBe(400);
  const body = (await res.json()) as {
    error: { details: { kind: string } };
  };
  expect(body.error.details.kind).toBe("invalid_repo_source");
});

test("unhandled paths fall through; bad methods answer 405", async () => {
  const get = await fetch(`${base}/skills/repo/list`);
  expect(get.status).toBe(405);
  const misc = await post("/skills/community/unknown");
  expect(misc.status).toBe(404);
});
