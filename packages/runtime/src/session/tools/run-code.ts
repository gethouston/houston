import { readFile } from "node:fs/promises";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { assertNotPlanMode } from "../live-mode-gate";
import {
  type SandboxArtifact,
  type SandboxResult,
  safeJoin,
  saveArtifacts,
  summarizeRun,
} from "./run-code-artifacts";
import type { RunCodeLimiter } from "./run-code-limiter";
import type { RunCodeTransport } from "./run-code-transport";

/**
 * The `run_code` tool — the load-bearing piece of the cheap-agent /
 * rented-sandbox architecture: instead of a local `bash` tool (which would
 * force the whole agent process into an always-on sandbox), the agent ships
 * code to a disposable Cloud Run box and gets output + files back.
 *
 * HOW it reaches that box is the transport's business (`run-code-transport.ts`):
 * a long-lived server-mode runtime calls the sandbox directly with its own
 * credentials; a pooled turn worker relays through the gateway under the turn
 * grant and holds no sandbox identity at all. Everything below — the budget,
 * the input-file gathering, the artifact write-back — is identical on both.
 */

// Keep this language set in sync with the sandbox's authoritative list in
// packages/code-sandbox/src/types.ts (LANGUAGES). The two packages are
// intentionally independent services, so the list is duplicated by design.
const Params = Type.Object({
  language: Type.Union(
    [Type.Literal("python"), Type.Literal("bash"), Type.Literal("node")],
    { description: "Language of the program to run." },
  ),
  code: Type.String({
    description: "The complete program source to execute in the sandbox.",
  }),
  input_files: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Workspace-relative paths to copy INTO the sandbox before running, for files the program needs to read. " +
        "Also grants permission to overwrite those same files with returned artifacts.",
    }),
  ),
  timeout_ms: Type.Optional(
    Type.Number({
      description:
        "How long the program may run, in milliseconds (1 to 120000). Omit for the sandbox default (60000).",
    }),
  ),
});

type RunCodeParams = Static<typeof Params>;

/** The sandbox's own ceiling (code-sandbox DEFAULT_LIMITS.maxTimeoutMs). */
const MAX_TIMEOUT_MS = 120_000;

/** Clamp rather than reject: an out-of-range ask still runs, at the ceiling. */
function clampTimeout(raw: number | undefined): number | undefined {
  if (raw === undefined || !Number.isFinite(raw)) return undefined;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.round(raw)));
}

/** The named failure behind a non-2xx, so nothing surfaces as a bare status. */
function transportError(status: number, body: string): Error {
  let code = "";
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    if (typeof parsed.code === "string") code = parsed.code;
  } catch {
    // Not JSON (a proxy's HTML error page); fall through to the status map.
  }
  if (status === 401) {
    // Two different 401s share the status: the direct transport's app token is
    // wrong, or this turn's grant is no longer accepted by the gateway.
    return new Error(
      code === "grant_expired" || code === "unauthenticated"
        ? "code execution rejected this turn's authority (401): the turn grant is no longer valid"
        : "code sandbox rejected the request (401): HOUSTON_CODE_SANDBOX_TOKEN does not match the sandbox's token",
    );
  }
  if (status === 403) {
    return new Error(
      "code sandbox rejected the request (403): this runtime's service account lacks run.invoker on the sandbox (Cloud Run IAM)",
    );
  }
  if (status === 503) {
    return new Error("code execution is not configured on this deployment");
  }
  if (status === 502) {
    return new Error(
      "the code sandbox is unavailable right now (502); try again in a moment",
    );
  }
  return new Error(`code sandbox returned ${status}: ${body}`);
}

export interface RunCodeOptions {
  /** How this deployment reaches the sandbox (direct HTTP, or the turn grant). */
  transport: RunCodeTransport;
  workspaceDir: string;
  /**
   * The run budget (Gate #5). Injected, not built here, because WHAT it bounds
   * differs: a long-lived runtime builds one per process (= per workspace),
   * while turn mode shares one across every turn the worker serves (= per
   * worker) — one tool instance is built per turn there, so a limiter created
   * in here would be a per-turn budget and bound nothing.
   */
  limiter: RunCodeLimiter;
}

export function makeRunCodeTool(opts: RunCodeOptions) {
  return defineTool({
    name: "run_code",
    label: "Run code",
    description:
      "Execute a short program (python, bash, or node) in a secure, isolated cloud sandbox and return its output. " +
      "Files the program writes are saved into the user's workspace. " +
      "To MODIFY an existing workspace file, list it in input_files; otherwise a same-named output is saved under a new name. " +
      "Use this whenever a task needs real computation or to produce a file - e.g. building a spreadsheet, a chart, or a PowerPoint.",
    promptSnippet:
      "Run code in a secure cloud sandbox to compute or produce files",
    parameters: Params,
    executionMode: "sequential",
    async execute(
      _toolCallId: string,
      params: RunCodeParams,
      signal: AbortSignal | undefined,
    ) {
      // Live gate for the mid-turn Mode-pill switch: an execute/auto-built turn
      // may now be running in Plan — no code runs, no files get produced.
      assertNotPlanMode("run code or produce files");
      // 1. Gather requested input files (missing/escaping paths throw → surfaced
      //    as a tool error, never silently skipped). Declared inputs may be
      //    overwritten by artifacts of the same path (see step 3).
      const files: SandboxArtifact[] = [];
      const declared = new Set<string>();
      for (const rel of params.input_files ?? []) {
        const abs = safeJoin(opts.workspaceDir, rel);
        const buf = await readFile(abs);
        files.push({ path: rel, contentBase64: buf.toString("base64") });
        declared.add(abs);
      }

      // 2. Run it in the remote sandbox, inside this runtime's run budget. The
      //    signal aborts the call on a cancelled turn; the sandbox reaps its own
      //    process by timeout server-side.
      const timeoutMs = clampTimeout(params.timeout_ms);
      const release = opts.limiter.acquire();
      let res: Response;
      try {
        res = await opts.transport(
          {
            language: params.language,
            code: params.code,
            files,
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
          },
          signal,
        );
      } finally {
        release();
      }
      // pi convention + Houston no-silent-failure: throw on a non-2xx.
      if (!res.ok) {
        throw transportError(res.status, await res.text().catch(() => ""));
      }
      const result = (await res.json()) as SandboxResult;

      // 3. Persist artifacts, then summarize for the model.
      const saved = await saveArtifacts(
        opts.workspaceDir,
        result.artifacts ?? [],
        declared,
      );
      return {
        content: [{ type: "text" as const, text: summarizeRun(result, saved) }],
        details: {
          exitCode: result.exitCode,
          timedOut: !!result.timedOut,
          truncated: !!result.truncated,
          ...saved,
        },
      };
    },
  });
}
