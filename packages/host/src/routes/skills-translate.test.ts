import { createServer, type Server } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { CloudPaths } from "../paths";
import type { RuntimeChannel } from "../ports";
import { MemoryVfs } from "../vfs";
import { handleSkillTranslate } from "./skills-translate";

/**
 * The post-install translate route (HOU-733): reads the installed SKILL.md,
 * translates its human surfaces in the requested mode (machine host-side, ai
 * via the runtime channel), rebuilds the file with identity/bookkeeping
 * untouched, and emits SkillsChanged.
 */

const ws = { id: "w1", ownerUserId: "alice" } as Workspace;
const agent = { id: "a1", workspaceId: "w1" } as Agent;
const paths = new CloudPaths();
const vfs = new MemoryVfs();
const events: HoustonEvent[] = [];

const MD = `---
name: research
title: Research a company
description: Deep research
version: 2
created: 2026-01-01
featured: true
integrations:
  - tavily
---

# Research

\`\`\`bash
echo untouched
\`\`\`

Steps.
`;

const root = paths.agentRoot(ws, agent);
const key = `${root}/.agents/skills/research/SKILL.md`;

/** Fake quick translator: uppercases so assertions are unambiguous. */
const fakeMachine = async (texts: string[]) => texts.map((t) => `MT:${t}`);

/** Fake channel: only translateTexts matters here. */
let channelCalls: { targetLanguage: string; ids: string[] }[] = [];
const channel = {
  translateTexts: async (
    _ctx: unknown,
    items: { id: string; text: string }[],
    targetLanguage: string,
  ) => {
    channelCalls.push({ targetLanguage, ids: items.map((i) => i.id) });
    return items.map((i) => ({ id: i.id, text: `AI:${i.text}` }));
  },
} as unknown as RuntimeChannel;

let withChannel = true;
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const rest = (req.url ?? "").replace(/^\//, "");
    void handleSkillTranslate(
      {
        vfs,
        paths,
        channel: withChannel ? channel : undefined,
        translator: fakeMachine,
      },
      { workspace: ws, agent },
      req.method ?? "GET",
      rest,
      req,
      res,
      (e) => events.push(e),
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

beforeEach(async () => {
  await vfs.writeText(key, MD);
  events.length = 0;
  channelCalls = [];
  withChannel = true;
});

const post = (path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("machine mode translates surfaces, preserves identity, emits SkillsChanged", async () => {
  const res = await post("/skills/research/translate", {
    target: "es",
    mode: "machine",
  });
  expect(res.status).toBe(200);
  const detail = (await res.json()) as { name: string; description: string };
  expect(detail.name).toBe("research");
  expect(detail.description).toBe("MT:Deep research");

  const md = (await vfs.readText(key)) ?? "";
  expect(md).toContain("name: research");
  expect(md).toContain("version: 2");
  expect(md).toContain("title: MT:Research a company");
  expect(md).toContain("MT:# Research");
  expect(events.some((e) => e.type === "SkillsChanged")).toBe(true);
});

test("ai mode goes through the channel with the target language", async () => {
  const res = await post("/skills/research/translate", {
    target: "pt",
    mode: "ai",
  });
  expect(res.status).toBe(200);
  expect(channelCalls).toEqual([
    { targetLanguage: "pt", ids: ["title", "description", "body"] },
  ]);
  const md = (await vfs.readText(key)) ?? "";
  expect(md).toContain("AI:Deep research");
});

test("ai mode without a channel answers 503 and changes nothing", async () => {
  withChannel = false;
  const res = await post("/skills/research/translate", {
    target: "es",
    mode: "ai",
  });
  expect(res.status).toBe(503);
  expect(await vfs.readText(key)).toBe(MD);
});

test("missing skill answers 404; bad input answers 400", async () => {
  const missing = await post("/skills/ghost/translate", {
    target: "es",
    mode: "machine",
  });
  expect(missing.status).toBe(404);

  const badTarget = await post("/skills/research/translate", {
    target: "not a lang",
    mode: "machine",
  });
  expect(badTarget.status).toBe(400);

  const badMode = await post("/skills/research/translate", {
    target: "es",
    mode: "telepathy",
  });
  expect(badMode.status).toBe(400);
});

test("a short translator reply answers 502, never a half-translated write", async () => {
  const short = async (texts: string[]) => texts.slice(1).map((t) => `MT:${t}`);
  const res = await new Promise<number>((resolve) => {
    const srv = createServer((req, rsp) => {
      void handleSkillTranslate(
        { vfs, paths, translator: short },
        { workspace: ws, agent },
        req.method ?? "GET",
        (req.url ?? "").replace(/^\//, ""),
        req,
        rsp,
      );
    });
    srv.listen(0, "127.0.0.1", async () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const r = await fetch(
        `http://127.0.0.1:${port}/skills/research/translate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "es", mode: "machine" }),
        },
      );
      resolve(r.status);
      srv.close();
    });
  });
  expect(res).toBe(502);
  expect(await vfs.readText(key)).toBe(MD);
});

test("translator failure answers 502 with the reason and changes nothing", async () => {
  const failing = async () => {
    throw new Error("translation service answered 429");
  };
  const res = await new Promise<{ status: number; body: string }>((resolve) => {
    const srv = createServer((req, rsp) => {
      void handleSkillTranslate(
        { vfs, paths, translator: failing },
        { workspace: ws, agent },
        req.method ?? "GET",
        (req.url ?? "").replace(/^\//, ""),
        req,
        rsp,
      );
    });
    srv.listen(0, "127.0.0.1", async () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const r = await fetch(
        `http://127.0.0.1:${port}/skills/research/translate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "es", mode: "machine" }),
        },
      );
      resolve({ status: r.status, body: await r.text() });
      srv.close();
    });
  });
  expect(res.status).toBe(502);
  expect(res.body).toContain("429");
  expect(await vfs.readText(key)).toBe(MD);
});

test("non-translate paths fall through", async () => {
  const res = await post("/skills/research/other");
  expect(res.status).toBe(404);
});
