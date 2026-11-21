import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
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

const CTX: Parameters<CanUseTool>[2] = {
  signal: new AbortController().signal,
  toolUseID: "t",
  requestId: "r",
};

function tempRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "claude-coord-")));
}

function takeCapturedOptions(): Options {
  const options = h.capturedOptions;
  h.capturedOptions = undefined;
  if (!options) throw new Error("the backend never called query");
  return options;
}

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
  expect(
    (await decide(gate, "Write", { file_path: join(workspaceDir, "notes.md") }))
      .behavior,
  ).toBe("deny");
  expect(
    (await decide(gate, "Read", { file_path: join(workspaceDir, "CLAUDE.md") }))
      .behavior,
  ).toBe("deny");
});

test("the coordinator can Read what people send it, and never Write there", async () => {
  const workspaceDir = tempRoot();
  const gate = await gateFor("coordinator", workspaceDir, tempRoot());
  const uploads = join(workspaceDir, "uploads");
  mkdirSync(join(uploads, "slack"), { recursive: true });
  const image = join(uploads, "image.png");
  writeFileSync(image, "png");
  writeFileSync(join(uploads, "slack", "brief.pdf"), "pdf");

  for (const file_path of [image, join(uploads, "slack", "brief.pdf")])
    expect((await decide(gate, "Read", { file_path })).behavior).toBe("allow");

  const write = await decide(gate, "Write", { file_path: image });
  expect(write.behavior).toBe("deny");
  if (write.behavior === "deny")
    expect(write.message).toContain("kept exactly as it arrived");
  expect(
    (await decide(gate, "Write", { file_path: join(uploads, "new.md") }))
      .behavior,
  ).toBe("deny");
  expect(
    (
      await decide(gate, "Read", {
        file_path: join(uploads, "..", "CLAUDE.md"),
      })
    ).behavior,
  ).toBe("deny");
});
