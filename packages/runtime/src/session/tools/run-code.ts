import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { RunCodeLimiter, type RunCodeLimits } from "./run-code-limiter";

/**
 * The `run_code` tool — the load-bearing piece of the cheap-agent /
 * rented-sandbox architecture: instead of a local `bash` tool (which would
 * force the whole agent process into an always-on sandbox), the agent ships
 * code to a disposable Cloud Run box and gets output + files back.
 *
 * Two auth layers ride two headers: `Authorization` carries a Google-signed ID
 * token for Cloud Run IAM (--no-allow-unauthenticated), `X-Sandbox-Token`
 * carries the app-layer shared secret. They MUST be separate headers — IAM
 * consumes Authorization, so an app token there would break under IAM.
 *
 * Artifact write-back is collision-safe: an artifact may only OVERWRITE a
 * workspace file the model explicitly declared via input_files (it asked to
 * transform that file); any other collision is saved under a new name and
 * reported. Untrusted sandbox code must never silently destroy user files.
 */

// Keep this language set in sync with the sandbox's authoritative list in
// packages/code-sandbox/src/types.ts (LANGUAGES). The two packages are
// intentionally independent Bun services, so the list is duplicated by design.
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
});

type RunCodeParams = Static<typeof Params>;

interface SandboxArtifact {
  path: string;
  contentBase64: string;
}
interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  artifacts: SandboxArtifact[];
  droppedArtifacts?: string[];
}

/** Resolve a workspace-relative path strictly inside the workspace; reject escapes. */
function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes the workspace: ${rel}`);
  }
  return abs;
}

/** First "name (2).ext"-style path that does not exist yet. */
function nonColliding(abs: string): string {
  const dir = dirname(abs);
  const ext = extname(abs);
  const stem = basename(abs, ext);
  for (let i = 2; i < 1000; i++) {
    const candidate = join(dir, `${stem} (${i})${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`too many name collisions for ${abs}`);
}

export interface RunCodeOptions {
  baseUrl: string;
  token: string;
  workspaceDir: string;
  /** Per-workspace budget (Gate #5). */
  limits: RunCodeLimits;
  /** Google-signed ID token for Cloud Run IAM; null on dev machines. */
  idToken?: () => Promise<string | null>;
}

export function makeRunCodeTool(opts: RunCodeOptions) {
  const limiter = new RunCodeLimiter(opts.limits);
  return defineTool({
    name: "run_code",
    label: "Run code",
    description:
      "Execute a short program (python, bash, or node) in a secure, isolated cloud sandbox and return its output. " +
      "Files the program writes are saved into the user's workspace. " +
      "To MODIFY an existing workspace file, list it in input_files; otherwise a same-named output is saved under a new name. " +
      "Use this whenever a task needs real computation or to produce a file — e.g. building a spreadsheet, a chart, or a PowerPoint.",
    promptSnippet:
      "Run code in a secure cloud sandbox to compute or produce files",
    parameters: Params,
    executionMode: "sequential",
    async execute(
      _toolCallId: string,
      params: RunCodeParams,
      signal: AbortSignal | undefined,
    ) {
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

      // 2. Run it in the remote sandbox, inside this workspace's run budget.
      //    `baseUrl` may carry a trailing slash from config; strip it to avoid
      //    `//run`. The signal aborts the HTTP call on a cancelled turn; the
      //    sandbox reaps its own process by timeout server-side.
      const release = limiter.acquire();
      let res: Response;
      try {
        const idToken = opts.idToken ? await opts.idToken() : null;
        res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/run`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(opts.token ? { "x-sandbox-token": opts.token } : {}),
            ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            language: params.language,
            code: params.code,
            files,
          }),
          signal,
        });
      } finally {
        release();
      }
      // pi convention + Houston no-silent-failure: throw on a non-2xx.
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 401) {
          throw new Error(
            "code sandbox rejected the request (401): HOUSTON_CODE_SANDBOX_TOKEN does not match the sandbox's token",
          );
        }
        if (res.status === 403) {
          throw new Error(
            "code sandbox rejected the request (403): this runtime's service account lacks run.invoker on the sandbox (Cloud Run IAM)",
          );
        }
        throw new Error(`code sandbox returned ${res.status}: ${body}`);
      }
      const result = (await res.json()) as SandboxResult;

      // 3. Persist artifacts. One bad path must not discard the others; a
      //    collision with an UNDECLARED workspace file is renamed, not
      //    overwritten. Everything is reported to the model — nothing silent.
      const saved: string[] = [];
      const updated: string[] = [];
      const renamed: { requested: string; savedAs: string }[] = [];
      const skipped: string[] = [];
      for (const a of result.artifacts ?? []) {
        try {
          let abs = safeJoin(opts.workspaceDir, a.path);
          const collided = existsSync(abs) && !declared.has(abs);
          if (collided) abs = nonColliding(abs);
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, Buffer.from(a.contentBase64, "base64"));
          const rel = relative(opts.workspaceDir, abs);
          if (collided) renamed.push({ requested: a.path, savedAs: rel });
          else if (declared.has(abs)) updated.push(rel);
          else saved.push(rel);
        } catch {
          skipped.push(a.path);
        }
      }

      // 4. Summarize for the model.
      const parts: string[] = [];
      if (result.stdout?.trim()) parts.push(result.stdout.trimEnd());
      if (result.stderr?.trim()) {
        // A clean exit that still wrote to stderr is warnings, not errors.
        parts.push(
          `${result.exitCode === 0 ? "[warnings]" : "[errors]"}\n${result.stderr.trimEnd()}`,
        );
      }
      if (result.truncated)
        parts.push("[output was truncated to the size limit]");
      if (result.timedOut)
        parts.push("[the program hit the time limit and was stopped]");
      if (saved.length) parts.push(`[saved files: ${saved.join(", ")}]`);
      if (updated.length)
        parts.push(`[updated input files: ${updated.join(", ")}]`);
      for (const r of renamed) {
        parts.push(
          `[${r.requested} already existed and was not an input file; saved as: ${r.savedAs}]`,
        );
      }
      if (skipped.length)
        parts.push(`[could not save (invalid path): ${skipped.join(", ")}]`);
      if (result.droppedArtifacts?.length) {
        parts.push(
          `[these files were produced but too large to return: ${result.droppedArtifacts.join(", ")}]`,
        );
      }
      if (
        typeof result.exitCode === "number" &&
        result.exitCode !== 0 &&
        !result.timedOut
      ) {
        parts.push(`[exit code ${result.exitCode}]`);
      }
      const text = parts.join("\n\n") || "(the program produced no output)";

      return {
        content: [{ type: "text" as const, text }],
        details: {
          exitCode: result.exitCode,
          timedOut: !!result.timedOut,
          truncated: !!result.truncated,
          saved,
          updated,
          renamed,
          skipped,
        },
      };
    },
  });
}
