import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CanUseTool,
  Options,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { expect, test, vi } from "vitest";
import { fileToolGuardOptions } from "../../session/coordinator-policy";
import { learningsDocPath } from "../../session/learnings-context";
import type { ToolSelection } from "../../session/tool-selection";
import type { ResolvedModel } from "../types";
import { createClaudeBackend } from "./backend";
import { serverClaudeLayout } from "./paths";

/**
 * The coordinator's exact-file wall must hold on the ANTHROPIC path too.
 *
 * The coordinator is the user's personal assistant: it hands every piece of
 * real work to one of the user's agents and produces nothing itself, so its
 * file tools get an exact-file allowlist (its memory document) instead of a
 * root (session/coordinator-policy.ts). The Claude backend enforces its file
 * rules in `canUseTool` rather than in pi's clamped file tools, so the policy
 * has to be handed to THAT gate — otherwise the same prompt injection the pi
 * path refuses would, on the one provider that runs through the Agent SDK,
 * rewrite a shared skill that then runs inside every one of the user's agents.
 */

const h = vi.hoisted(() => ({
  capturedOptions: undefined as Options | undefined,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (params: { options: Options }) => {
    h.capturedOptions = params.options;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
    };
  },
  createSdkMcpServer: (opts: { name: string }) => ({
    type: "sdk",
    name: opts.name,
    instance: {},
  }),
}));

const TOOL_SELECTION: ToolSelection = { toolNames: [], includeRunCode: false };
const MODEL: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-6",
  contextWindow: 200_000,
};

// The permission-context 3rd arg is unused by the clamp; a stub typed from the
// SDK's own signature keeps the call site honest without `any`.
const CTX: Parameters<CanUseTool>[2] = {
  signal: new AbortController().signal,
  toolUseID: "t",
  requestId: "r",
};

// realpath so the root matches WorkspaceGuard's canonicalization (on macOS the
// tmpdir is a /var → /private/var symlink; an un-canonicalized root would make
// every absolute in-workspace path look like an escape).
function tempRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "claude-coord-")));
}

/** The SDK options the last run produced, cleared so the next run cannot read
 *  a stale capture. Read in its own scope: assigning `undefined` in the caller
 *  narrows the hoisted field to `undefined` for the rest of that function. */
function takeCapturedOptions(): Options {
  const options = h.capturedOptions;
  h.capturedOptions = undefined;
  if (!options) throw new Error("the backend never called query");
  return options;
}

/**
 * The permission gate the backend actually hands the SDK, for a runtime in the
 * given role — built end to end through `createClaudeBackend` so this pins the
 * WIRING, not just the policy function it reads.
 */
async function gateFor(
  role: "coordinator" | null,
  workspaceDir: string,
  sharedSkillsDir: string,
): Promise<CanUseTool> {
  const backend = createClaudeBackend({
    workspaceDir,
    layout: serverClaudeLayout(join(workspaceDir, "data")),
    readToken: () => undefined,
    toolSelection: TOOL_SELECTION,
    systemPrompt: "system",
    personalAssistant: role === "coordinator",
    fileGuard: fileToolGuardOptions({ role, workspaceDir, sharedSkillsDir }),
  });
  const session = await backend.createSession({
    conversationId: "c1",
    model: MODEL,
  });
  await session.prompt("hi");
  const gate = takeCapturedOptions().canUseTool;
  if (!gate) throw new Error("the backend built no permission gate");
  return gate;
}

async function decide(
  gate: CanUseTool,
  tool: string,
  input: Record<string, unknown>,
): Promise<PermissionResult> {
  const result = await gate(tool, input, CTX);
  if (!result) throw new Error("expected a permission result");
  return result;
}

test("the coordinator is refused a Write into the shared skills mirror", async () => {
  const sharedSkillsDir = tempRoot();
  const skill = join(sharedSkillsDir, "SKILL.md");

  const coordinator = await gateFor("coordinator", tempRoot(), sharedSkillsDir);
  expect(
    (await decide(coordinator, "Write", { file_path: skill })).behavior,
  ).toBe("deny");

  // The SAME mirror is writable for an ordinary agent — editing a shared skill
  // there IS editing the org original, by design. The refusal above is the
  // role's, not the directory's.
  const agent = await gateFor(null, tempRoot(), sharedSkillsDir);
  expect((await decide(agent, "Write", { file_path: skill })).behavior).toBe(
    "allow",
  );
});

test("the coordinator keeps exactly its memory document, nothing else", async () => {
  const workspaceDir = tempRoot();
  const gate = await gateFor("coordinator", workspaceDir, tempRoot());

  expect(
    (
      await decide(gate, "Write", {
        file_path: learningsDocPath(workspaceDir),
      })
    ).behavior,
  ).toBe("allow");
  // Its own workspace is not a licence: consolidating memory is the only file
  // work it has, so every other in-workspace path is refused too.
  expect(
    (await decide(gate, "Write", { file_path: join(workspaceDir, "notes.md") }))
      .behavior,
  ).toBe("deny");
  expect(
    (await decide(gate, "Read", { file_path: join(workspaceDir, "CLAUDE.md") }))
      .behavior,
  ).toBe("deny");
});
