import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeRunCodeTool } from "./run-code";
import { RunCodeLimiter } from "./run-code-limiter";
import {
  directRunCodeTransport,
  sandboxFetchRunCodeTransport,
} from "./run-code-transport";
import type { SandboxFetch } from "./sandbox-fetch";

interface SandboxArtifact {
  path: string;
  contentBase64: string;
  bytes?: number;
}

interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated?: boolean;
  artifacts: SandboxArtifact[];
  droppedArtifacts?: string[];
}

interface SandboxRequestBody {
  language: string;
  code: string;
  files?: SandboxArtifact[];
  timeoutMs?: number;
}

interface RunCodeDetails {
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  saved: string[];
  updated: string[];
  renamed: { requested: string; savedAs: string }[];
  skipped: string[];
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const fromB64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

// A fake sandbox: records the last request (+headers) and replies with a
// scripted result, optionally after a delay (for the concurrency-budget test).
let server: Server;
let base: string;
let lastBody: SandboxRequestBody | null = null;
let lastHeaders: Record<string, string | string[] | undefined> = {};
let nextStatus = 200;
let nextDelayMs = 0;
let nextResult: SandboxResult = {
  exitCode: 0,
  stdout: "ok",
  stderr: "",
  timedOut: false,
  artifacts: [],
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      lastHeaders = req.headers;
      setTimeout(() => {
        res.writeHead(nextStatus, { "content-type": "application/json" });
        res.end(
          JSON.stringify(nextStatus === 200 ? nextResult : { error: "boom" }),
        );
      }, nextDelayMs);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server.close());

const LIMITS = { maxConcurrent: 2, maxPerMinute: 100 };
const tool = (workspaceDir: string) =>
  makeRunCodeTool({
    transport: directRunCodeTransport({ baseUrl: base, token: "" }),
    workspaceDir,
    limiter: new RunCodeLimiter(LIMITS),
  });
const run = (
  built: ReturnType<typeof makeRunCodeTool>,
  id: string,
  params: Parameters<ReturnType<typeof makeRunCodeTool>["execute"]>[1],
) =>
  built.execute(
    id,
    params,
    undefined,
    undefined,
    {} as unknown as ExtensionContext,
  );

describe("run_code tool", () => {
  test("posts language+code, returns stdout to the model", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "4\n",
      stderr: "",
      timedOut: false,
      artifacts: [],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const r = await tool(ws).execute(
      "t1",
      { language: "python", code: "print(2+2)" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    if (!lastBody) throw new Error("request body not captured");
    expect(lastBody.language).toBe("python");
    expect(lastBody.code).toBe("print(2+2)");
    expect(r.content[0]).toEqual({ type: "text", text: "4" });
  });

  test("writes returned artifacts back into the workspace", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [
        { path: "deck.pptx", contentBase64: b64("PPTX-BYTES"), bytes: 10 },
      ],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const r = await tool(ws).execute(
      "t2",
      { language: "python", code: "..." },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    expect(await readFile(join(ws, "deck.pptx"), "utf8")).toBe("PPTX-BYTES");
    expect((r.details as unknown as RunCodeDetails).saved).toEqual([
      "deck.pptx",
    ]);
    const first = r.content[0];
    expect(first.type === "text" && first.text).toContain(
      "saved files: deck.pptx",
    );
  });

  test("sends requested input files from the workspace", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await writeFile(join(ws, "data.csv"), "a,b\n1,2\n");
    await tool(ws).execute(
      "t3",
      { language: "python", code: "x", input_files: ["data.csv"] },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    if (!lastBody) throw new Error("request body not captured");
    const files = lastBody.files;
    if (!files) throw new Error("expected uploaded files");
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("data.csv");
    expect(fromB64(files[0].contentBase64)).toBe("a,b\n1,2\n");
  });

  test("throws on a non-2xx sandbox response (no silent failure)", async () => {
    nextStatus = 500;
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await expect(
      tool(ws).execute(
        "t4",
        { language: "python", code: "x" },
        undefined,
        undefined,
        {} as unknown as ExtensionContext,
      ),
    ).rejects.toThrow(/code sandbox returned 500/);
  });

  test("401 yields a token-specific error", async () => {
    nextStatus = 401;
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await expect(
      tool(ws).execute(
        "t6",
        { language: "python", code: "x" },
        undefined,
        undefined,
        {} as unknown as ExtensionContext,
      ),
    ).rejects.toThrow(/HOUSTON_CODE_SANDBOX_TOKEN/);
  });

  test("surfaces truncation to the model", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "partial",
      stderr: "",
      timedOut: false,
      truncated: true,
      artifacts: [],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const r = await tool(ws).execute(
      "t7",
      { language: "python", code: "x" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    const first = r.content[0];
    expect(first.type === "text" && first.text).toContain("truncated");
  });

  test("a bad artifact path is skipped, not fatal; siblings still saved", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      truncated: false,
      artifacts: [
        { path: "../evil.txt", contentBase64: b64("nope") },
        { path: "good.txt", contentBase64: b64("yes") },
      ],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const r = await tool(ws).execute(
      "t8",
      { language: "python", code: "x" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    expect(await readFile(join(ws, "good.txt"), "utf8")).toBe("yes");
    expect((r.details as unknown as RunCodeDetails).saved).toEqual([
      "good.txt",
    ]);
    expect((r.details as unknown as RunCodeDetails).skipped).toEqual([
      "../evil.txt",
    ]);
  });

  test("rejects an input file that escapes the workspace", async () => {
    nextStatus = 200;
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await expect(
      tool(ws).execute(
        "t5",
        { language: "bash", code: "x", input_files: ["../escape"] },
        undefined,
        undefined,
        {} as unknown as ExtensionContext,
      ),
    ).rejects.toThrow(/escapes the workspace/);
  });

  test("auth rides two headers: app token in X-Sandbox-Token, ID token in Authorization", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const t = makeRunCodeTool({
      transport: directRunCodeTransport({
        baseUrl: base,
        token: "app-secret",
        idToken: async () => "google-id-token",
      }),
      workspaceDir: ws,
      limiter: new RunCodeLimiter(LIMITS),
    });
    await t.execute(
      "t9",
      { language: "python", code: "x" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    expect(lastHeaders["x-sandbox-token"]).toBe("app-secret");
    expect(lastHeaders.authorization).toBe("Bearer google-id-token");
  });

  test("an artifact colliding with an UNDECLARED workspace file is renamed, never overwritten", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [{ path: "report.txt", contentBase64: b64("NEW CONTENT") }],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await writeFile(join(ws, "report.txt"), "PRECIOUS USER DATA");
    const r = await tool(ws).execute(
      "t10",
      { language: "python", code: "x" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    expect(await readFile(join(ws, "report.txt"), "utf8")).toBe(
      "PRECIOUS USER DATA",
    );
    expect(await readFile(join(ws, "report (2).txt"), "utf8")).toBe(
      "NEW CONTENT",
    );
    expect((r.details as unknown as RunCodeDetails).renamed).toEqual([
      { requested: "report.txt", savedAs: "report (2).txt" },
    ]);
    const first = r.content[0];
    expect(first.type === "text" && first.text).toContain("already existed");
  });

  test("an artifact matching a DECLARED input file overwrites it (the edit-my-file loop)", async () => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [{ path: "deck.pptx", contentBase64: b64("V2 DECK") }],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await writeFile(join(ws, "deck.pptx"), "V1 DECK");
    const r = await tool(ws).execute(
      "t11",
      { language: "python", code: "x", input_files: ["deck.pptx"] },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    expect(await readFile(join(ws, "deck.pptx"), "utf8")).toBe("V2 DECK");
    expect((r.details as unknown as RunCodeDetails).updated).toEqual([
      "deck.pptx",
    ]);
    expect((r.details as unknown as RunCodeDetails).renamed).toEqual([]);
  });

  test("the per-workspace budget rejects a run over the concurrency cap (Gate #5)", async () => {
    nextStatus = 200;
    nextDelayMs = 80;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const t = makeRunCodeTool({
      transport: directRunCodeTransport({ baseUrl: base, token: "" }),
      workspaceDir: ws,
      limiter: new RunCodeLimiter({ maxConcurrent: 1, maxPerMinute: 100 }),
    });
    const first = t.execute(
      "t12",
      { language: "python", code: "x" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
    await new Promise((r) => setTimeout(r, 10)); // let the first call claim the slot
    await expect(
      t.execute(
        "t13",
        { language: "python", code: "x" },
        undefined,
        undefined,
        {} as unknown as ExtensionContext,
      ),
    ).rejects.toThrow(/code-execution budget/);
    await first;
    nextDelayMs = 0;
  });

  test("403 yields an IAM-specific error (missing run.invoker)", async () => {
    nextStatus = 403;
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await expect(
      tool(ws).execute(
        "t14",
        { language: "python", code: "x" },
        undefined,
        undefined,
        {} as unknown as ExtensionContext,
      ),
    ).rejects.toThrow(/run\.invoker/);
    nextStatus = 200;
  });
});

// --- Turn mode: the same tool over the turn's sandbox facade ------------------

describe("run_code over the sandbox-fetch transport (turn mode)", () => {
  /** A facade stand-in: records what the tool asked for, answers as the relay would. */
  function facade(reply: () => Response) {
    const seen: { path: string; body: SandboxRequestBody }[] = [];
    const call = async (path: string, init?: RequestInit) => {
      seen.push({
        path,
        body: JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
      });
      return reply();
    };
    return { seen, call };
  }

  const turnTool = (
    workspaceDir: string,
    call: SandboxFetch,
    limiter = new RunCodeLimiter(LIMITS),
  ) =>
    makeRunCodeTool({
      transport: sandboxFetchRunCodeTransport({
        call,
        path: "/sandbox/code/run",
      }),
      workspaceDir,
      limiter,
    });

  test("posts the RunRequest to /sandbox/code/run and returns the result", async () => {
    const relay = facade(() =>
      Response.json({
        exitCode: 0,
        stdout: "7\n",
        stderr: "",
        timedOut: false,
        truncated: false,
        artifacts: [{ path: "out.txt", contentBase64: b64("hi") }],
      }),
    );
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const r = await run(turnTool(ws, relay.call), "u1", {
      language: "python",
      code: "print(3+4)",
    });
    expect(relay.seen[0]?.path).toBe("/sandbox/code/run");
    expect(relay.seen[0]?.body).toEqual({
      language: "python",
      code: "print(3+4)",
      files: [],
    });
    expect(r.content[0]).toEqual({
      type: "text",
      text: "7\n\n[saved files: out.txt]",
    });
    expect(await readFile(join(ws, "out.txt"), "utf8")).toBe("hi");
  });

  test("a relayed 401 names the expired grant, not the sandbox token", async () => {
    const relay = facade(() =>
      Response.json(
        { error: "turn grant expired", code: "grant_expired" },
        { status: 401 },
      ),
    );
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await expect(
      run(turnTool(ws, relay.call), "u2", { language: "bash", code: "x" }),
    ).rejects.toThrow(/turn grant is no longer valid/);
  });

  test("503 not_configured and 502 sandbox_unavailable each get their own message", async () => {
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const unconfigured = facade(() =>
      Response.json(
        { error: "no sandbox", code: "not_configured" },
        {
          status: 503,
        },
      ),
    );
    await expect(
      run(turnTool(ws, unconfigured.call), "u3", {
        language: "bash",
        code: "x",
      }),
    ).rejects.toThrow(/code execution is not configured on this deployment/);
    const down = facade(() =>
      Response.json(
        { error: "upstream", code: "sandbox_unavailable" },
        {
          status: 502,
        },
      ),
    );
    await expect(
      run(turnTool(ws, down.call), "u4", { language: "bash", code: "x" }),
    ).rejects.toThrow(/sandbox is unavailable right now/);
  });

  test("a sandbox-level 4xx passes through with its own body", async () => {
    const relay = facade(() =>
      Response.json({ error: "unsupported language: cobol" }, { status: 400 }),
    );
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await expect(
      run(turnTool(ws, relay.call), "u5", { language: "bash", code: "x" }),
    ).rejects.toThrow(/unsupported language: cobol/);
  });

  test("one shared limiter is one budget across turns (the worker's, not the turn's)", async () => {
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    const shared = new RunCodeLimiter({ maxConcurrent: 1, maxPerMinute: 100 });
    const ok = () =>
      Response.json({
        exitCode: 0,
        stdout: "",
        stderr: "",
        timedOut: false,
        truncated: false,
        artifacts: [],
      });
    // The first turn's call is still in flight; the SECOND tool (the next turn
    // on this worker) must see the budget the first one is already spending.
    const held: { release: (() => void) | null } = { release: null };
    const first = makeRunCodeTool({
      transport: () =>
        new Promise<Response>((resolve) => {
          held.release = () => resolve(ok());
        }),
      workspaceDir: ws,
      limiter: shared,
    });
    const second = turnTool(ws, facade(ok).call, shared);
    const inFlight = run(first, "u6", { language: "bash", code: "x" });
    await new Promise((r) => setTimeout(r, 10));
    await expect(
      run(second, "u7", { language: "bash", code: "x" }),
    ).rejects.toThrow(/code-execution budget/);
    held.release?.();
    await inFlight;
  });
});

// --- timeout_ms ---------------------------------------------------------------

describe("run_code timeout_ms", () => {
  const withTimeout = async (timeout_ms: number | undefined) => {
    nextStatus = 200;
    nextResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      artifacts: [],
    };
    const ws = await mkdtemp(join(tmpdir(), "ws-"));
    await run(tool(ws), "tm", {
      language: "python",
      code: "x",
      ...(timeout_ms === undefined ? {} : { timeout_ms }),
    });
    if (!lastBody) throw new Error("request body not captured");
    return lastBody.timeoutMs;
  };

  test("is forwarded to the sandbox instead of being dropped", async () => {
    expect(await withTimeout(5_000)).toBe(5_000);
  });

  test("is omitted when the model does not ask (the sandbox default stands)", async () => {
    expect(await withTimeout(undefined)).toBeUndefined();
  });

  test.each([
    [0, 1],
    [-30, 1],
    [900_000, 120_000],
    [1_500.4, 1_500],
  ])("clamps %s to the sandbox's own range (%s)", async (asked, sent) => {
    expect(await withTimeout(asked)).toBe(sent);
  });
});
