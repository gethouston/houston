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

const MAX_TIMEOUT_MS = 120_000;

function clampTimeout(raw: number | undefined): number | undefined {
  if (raw === undefined || !Number.isFinite(raw)) return undefined;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.round(raw)));
}

function transportError(status: number, body: string): Error {
  let code = "";
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    if (typeof parsed.code === "string") code = parsed.code;
  } catch {}
  if (status === 401) {
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
  transport: RunCodeTransport;
  workspaceDir: string;
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
      assertNotPlanMode("run code or produce files");
      const files: SandboxArtifact[] = [];
      const declared = new Set<string>();
      for (const rel of params.input_files ?? []) {
        const abs = safeJoin(opts.workspaceDir, rel);
        const buf = await readFile(abs);
        files.push({ path: rel, contentBase64: buf.toString("base64") });
        declared.add(abs);
      }

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
      if (!res.ok) {
        throw transportError(res.status, await res.text().catch(() => ""));
      }
      const result = (await res.json()) as SandboxResult;

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
