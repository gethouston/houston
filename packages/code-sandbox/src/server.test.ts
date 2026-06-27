import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handle } from "./server";

// Drive the real router over a real socket. config.token is empty in tests
// (no SANDBOX_TOKEN set), so /run is open here; the auth path is covered by the
// explicit header assertions below would require a token — we test the open path
// and the validation paths, which is what the router branches on.
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

// --- App-token gate (X-Sandbox-Token) ----------------------------------------

import { checkSandboxToken } from "./server";

test("checkSandboxToken: exact match passes, anything else fails", () => {
  expect(checkSandboxToken("s3cret", "s3cret")).toBe(true);
  expect(checkSandboxToken("wrong", "s3cret")).toBe(false);
  expect(checkSandboxToken("s3cret-longer", "s3cret")).toBe(false);
  expect(checkSandboxToken(undefined, "s3cret")).toBe(false);
  expect(checkSandboxToken(["s3cret"], "s3cret")).toBe(false); // repeated header
});

test("checkSandboxToken: a Bearer-prefixed value does NOT match (token rides X-Sandbox-Token raw)", () => {
  // Authorization belongs to Cloud Run IAM; if a caller mistakenly sends
  // "Bearer <token>" in X-Sandbox-Token it must fail loudly, not half-work.
  expect(checkSandboxToken("Bearer s3cret", "s3cret")).toBe(false);
});
