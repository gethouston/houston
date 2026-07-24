import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import { handleSkillsDirectory } from "./skills-directory";

/**
 * The user-scoped (no-agent) marketplace reads the web/desktop host adapter
 * calls while browsing: /v1/skills/community/{search,popular} + repo/list.
 */

const outbound: typeof fetch = async (input) => {
  const url = String(input);
  if (url === "https://api.github.com/repos/owner/repo")
    return new Response("{}");
  if (url.includes("git/trees/HEAD"))
    return new Response(
      JSON.stringify({
        tree: [{ path: "research/SKILL.md", type: "blob" }],
        truncated: false,
      }),
    );
  if (url.includes("raw.githubusercontent.com/owner/repo/HEAD/research/"))
    return new Response(
      "---\nname: research\ndescription: Deep research\n---\n\n# Research\n\nSteps.",
    );
  return new Response("", { status: 404 });
};

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleSkillsDirectory(req.method ?? "GET", req.url ?? "/", req, res, {
      fetchImpl: outbound,
    }).then((handled) => {
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

test("top-level repo list serves discovery without an agent in scope", async () => {
  const res = await fetch(`${base}/v1/skills/repo/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "github.com/owner/repo" }),
  });
  expect(res.status).toBe(200);
  const skills = (await res.json()) as Array<{ id: string }>;
  expect(skills[0]?.id).toBe("research");
});

test("community preview reads the real SKILL.md detail", async () => {
  const res = await fetch(`${base}/v1/skills/community/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "owner/repo", skillId: "research" }),
  });
  expect(res.status).toBe(200);
  const preview = (await res.json()) as {
    description: string;
    tags: string[];
    integrations: string[];
    content: string | null;
  };
  expect(preview.description).toBe("Deep research");
  expect(preview.tags).toEqual([]);
  // The instructions + connected apps survive the wire, not just the parse.
  expect(preview.integrations).toEqual([]);
  expect(preview.content).toBe("\n# Research\n\nSteps.");
});

test("community preview 400s when skillId is missing", async () => {
  const res = await fetch(`${base}/v1/skills/community/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "owner/repo" }),
  });
  expect(res.status).toBe(400);
});

test("typed errors expose kind at both shapes the two clients read", async () => {
  const res = await fetch(`${base}/v1/skills/repo/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "not a repo" }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as {
    error: { kind: string; details: { kind: string } };
  };
  expect(body.error.kind).toBe("invalid_repo_source");
  expect(body.error.details.kind).toBe("invalid_repo_source");
});

test("non-marketplace paths fall through; GET answers 405", async () => {
  const miss = await fetch(`${base}/v1/skills/community/install`, {
    method: "POST",
  });
  expect(miss.status).toBe(404); // install is agent-scoped, not served here
  const get = await fetch(`${base}/v1/skills/repo/list`);
  expect(get.status).toBe(405);
});
