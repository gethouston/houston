import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import { handleSkillsDirectory } from "./skills-directory";

/**
 * The user-scoped (no-agent) marketplace reads the web/desktop host adapter
 * calls while browsing: /v1/skills/community/{search,popular} + repo/list.
 */

/** What the fake skills.sh saw on its latest search, for abort checks. An
 *  object holder: a bare `let` assigned only inside the fetch closure narrows
 *  to `never` at the assertion sites. */
const upstream: { signal: AbortSignal | null | undefined; hang: boolean } = {
  signal: undefined,
  hang: false,
};

const outbound: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://skills.sh/api/search")) {
    upstream.signal = init?.signal;
    if (upstream.hang) {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    }
    return new Response(
      JSON.stringify({
        skills: [
          {
            id: "owner/repo/research",
            skillId: "research",
            name: "research",
            installs: 5,
            source: "owner/repo",
          },
        ],
      }),
    );
  }
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

test("community search answers a completed request normally", async () => {
  // Guards the client-abort signal against firing early: under node the
  // request's own "close" must not abort the upstream fetch of a live request
  // (an early abort would reject the fetch and this would not be a 200). The
  // signal DOES abort once the response completes, so it is not asserted.
  const res = await fetch(`${base}/v1/skills/community/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "research" }),
  });
  expect(res.status).toBe(200);
  const skills = (await res.json()) as Array<{ skillId: string }>;
  expect(skills[0]?.skillId).toBe("research");
});

test("a client that abandons its search cancels the skills.sh fetch (PRODUCT-1728)", async () => {
  // Object.assign: a direct property assignment narrows `signal` to
  // `undefined` for the rest of the test and the `.aborted` reads below.
  Object.assign(upstream, { hang: true, signal: undefined });
  const controller = new AbortController();
  const pending = fetch(`${base}/v1/skills/community/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "abandoned typing" }),
    signal: controller.signal,
  });
  // The directory spaces outbound requests; wait until the upstream is in flight.
  for (let i = 0; i < 200 && !upstream.signal; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(upstream.signal?.aborted).toBe(false);
  controller.abort();
  await expect(pending).rejects.toThrow();
  for (let i = 0; i < 100 && !upstream.signal?.aborted; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(upstream.signal?.aborted).toBe(true);
  upstream.hang = false;
});

test("non-marketplace paths fall through; GET answers 405", async () => {
  const miss = await fetch(`${base}/v1/skills/community/install`, {
    method: "POST",
  });
  expect(miss.status).toBe(404); // install is agent-scoped, not served here
  const get = await fetch(`${base}/v1/skills/repo/list`);
  expect(get.status).toBe(405);
});
