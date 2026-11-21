import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { handle } from "./server";

vi.hoisted(() => {
  process.env.SANDBOX_ALLOW_UNAUTHENTICATED = "1";
});
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server.close());

const post = (body: unknown) =>
  fetch(`${base}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("sandbox HTTP server", () => {
  test("GET /health → ok", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("POST /run executes python and returns the result", async () => {
    const res = await post({ language: "python", code: "print(2 + 2)" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("4");
  });

  test("bad language → 400 with a real reason", async () => {
    const res = await post({ language: "cobol", code: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported/);
  });

  test("unknown route → 404", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});

import { checkSandboxToken, sandboxRequestAuthorized } from "./server";

test("checkSandboxToken: exact match passes, anything else fails", () => {
  expect(checkSandboxToken("s3cret", "s3cret")).toBe(true);
  expect(checkSandboxToken("wrong", "s3cret")).toBe(false);
  expect(checkSandboxToken("s3cret-longer", "s3cret")).toBe(false);
  expect(checkSandboxToken(undefined, "s3cret")).toBe(false);
  expect(checkSandboxToken(["s3cret"], "s3cret")).toBe(false);
});

test("an empty token refuses unless the local-dev override is explicit", () => {
  const gate = { token: "", allowUnauthenticated: false };
  expect(sandboxRequestAuthorized(undefined, gate)).toBe(false);
  expect(sandboxRequestAuthorized("anything", gate)).toBe(false);
  expect(
    sandboxRequestAuthorized(undefined, {
      ...gate,
      allowUnauthenticated: true,
    }),
  ).toBe(true);
});

test("a configured token ignores the override entirely", () => {
  const gate = { token: "s3cret", allowUnauthenticated: true };
  expect(sandboxRequestAuthorized("s3cret", gate)).toBe(true);
  expect(sandboxRequestAuthorized("wrong", gate)).toBe(false);
  expect(sandboxRequestAuthorized(undefined, gate)).toBe(false);
});

test("checkSandboxToken: a Bearer-prefixed value does NOT match (token rides X-Sandbox-Token raw)", () => {
  expect(checkSandboxToken("Bearer s3cret", "s3cret")).toBe(false);
});
