import type { TurnMode } from "@houston/protocol";
import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import {
  INTEGRATION_TOOL_NAMES,
  REQUEST_CONNECTION_TOOL_NAME,
} from "./tools/integrations";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

export type CodeExecutionMode = "local" | "remote" | "disabled";

export interface ToolSelectionInput {
  codeExecution: CodeExecutionMode;
  integrations: boolean;
}

export interface ToolSelection {
  toolNames: string[];
  includeRunCode: boolean;
}

/**
 * pi requires a name allowlist for both built-in and custom tools. Keep that
 * decision pure so managed pods can prove code execution is disabled without
 * spinning up a live model session.
 */
/**
 * The tool subset a "plan" turn is clamped to: the clamped-fs READ tools
 * (`read, ls, grep, find` — never `edit`/`write`), `ask_user` (holds no
 * credential, takes no real-world action), and `bash` — planning needs live
 * lookups a file read can't answer (the current time, a `curl`/`wget` fetch of
 * public information); without them a Planner-default chat stonewalls trivial
 * questions. `bash` is membership-gated like everything else: it survives only
 * when the execute selection carried it (codeExecution=local), so
 * disabled/remote deployments stay bash-less in plan too. Its no-mutation rule
 * is the overlay's mandate (mode-overlays.ts), not a tool wall — the same
 * posture as auto-run inside the single-tenant workspace guard. Everything that
 * WRITES or acts on the user's connected apps is still dropped: `edit, write,
 * run_code`, and ALL integration tools (`integration_search`,
 * `integration_execute`, `request_connection` — an integration call is a
 * real-world action against the user's connected apps).
 */
export const PLAN_MODE_TOOL_NAMES: readonly string[] = [
  "read",
  "ls",
  "grep",
  "find",
  ASK_USER_TOOL_NAME,
  "bash",
];

/**
 * Clamp an execute-mode tool allowlist to the plan-mode subset: keep only the
 * names in {@link PLAN_MODE_TOOL_NAMES}, preserving their order. Applied to
 * whatever `buildToolSelection` produced, so plan mode composes with every
 * code-execution / integration selection (an `edit`/`write`/`run_code`/
 * `integration_*` name is simply filtered out, and `bash` survives only where
 * the selection had it).
 */
export function planToolNames(all: readonly string[]): string[] {
  return all.filter((name) => PLAN_MODE_TOOL_NAMES.includes(name));
}

/**
 * The two blocking/interactive tools Autopilot ("auto") mode drops: `ask_user`
 * (holds the turn open on a question) and `request_connection` (holds it open on
 * a connect card). Auto never waits on the user, so both are removed. EVERYTHING
 * else an execute turn had — the clamped-fs read AND write tools, `bash` /
 * `run_code`, and the acting integration tools (`integration_search`,
 * `integration_execute`) — stays: auto acts, it just never blocks.
 */
export const AUTO_MODE_EXCLUDED_TOOL_NAMES: readonly string[] = [
  ASK_USER_TOOL_NAME,
  REQUEST_CONNECTION_TOOL_NAME,
];

/**
 * Clamp an execute-mode tool allowlist to the Autopilot subset: drop exactly the
 * blocking tools in {@link AUTO_MODE_EXCLUDED_TOOL_NAMES}, keep everything else
 * in its original order. The inverse of plan (which keeps only read-only tools) —
 * auto keeps every acting tool and only removes the ways to wait on the user.
 */
export function autoToolNames(all: readonly string[]): string[] {
  return all.filter((name) => !AUTO_MODE_EXCLUDED_TOOL_NAMES.includes(name));
}

/**
 * The one place a turn's mode picks its tool allowlist: "plan" clamps to the
 * read-only subset PLUS the plan-only `plan_ready` tool, "auto" drops the
 * blocking tools, and "execute" (or an absent mode) passes the full allowlist
 * through unchanged. Both backends dispatch through here so the pi and Claude
 * paths never drift on what a mode allows.
 *
 * Strip-then-reinject: `plan_ready` is a plan-mode-only tool that must never
 * survive into execute/auto, yet the incoming `all` set (e.g. the Claude
 * backend's built list) may include it. So it is filtered out unconditionally
 * first, then re-added ONLY on the plan branch. This keeps `plan_ready` out of
 * the execute base allowlist regardless of how `all` was assembled.
 */
export function toolNamesForMode(
  mode: TurnMode | undefined,
  all: readonly string[],
): string[] {
  const base = all.filter((name) => name !== PLAN_READY_TOOL_NAME);
  switch (mode) {
    case "plan":
      return [...planToolNames(base), PLAN_READY_TOOL_NAME];
    case "auto":
      return autoToolNames(base);
    default:
      return [...base];
  }
}

export function buildToolSelection(input: ToolSelectionInput): ToolSelection {
  const executable =
    input.codeExecution === "local"
      ? ["bash"]
      : input.codeExecution === "remote"
        ? ["run_code"]
        : [];
  return {
    toolNames: [
      ...CLAMPED_FILE_TOOL_NAMES,
      // ask_user is available in EVERY mode/backend — any blocking question,
      // choice, or approval goes through it instead of plain-text.
      ASK_USER_TOOL_NAME,
      // suggest_reusable is available in execute AND auto — it holds no
      // credential, takes no real-world action, and never blocks the turn (a
      // clean finish offering to save the work as a Skill/Routine). It must
      // NEVER reach plan mode, and it won't automatically: PLAN_MODE_TOOL_NAMES
      // (the plan allowlist) doesn't list it, so `planToolNames` filters it out;
      // and it isn't in AUTO_MODE_EXCLUDED_TOOL_NAMES, so auto keeps it.
      SUGGEST_REUSABLE_TOOL_NAME,
      ...executable,
      ...(input.integrations ? INTEGRATION_TOOL_NAMES : []),
    ],
    includeRunCode: input.codeExecution === "remote",
  };
}
