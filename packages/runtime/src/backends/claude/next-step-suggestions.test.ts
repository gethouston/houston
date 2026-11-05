import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  Options,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { applyServedCredential } from "../../auth/auth-file";
import { recoverFollowUpActions } from "../../session/follow-up-pass";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../../session/interaction";
import { makeSuggestActionsTool } from "../../session/tools/suggest-actions";
import { createTurnBackend, turnClaudeLayout } from "../../turn/turn-backend";
import { turnSessionRequest } from "../../turn/turn-request";
import { createClaudeBackend } from "./backend";
import { toZodShape } from "./schema-to-zod";
import { loadedClaudeSdk, preloadClaudeSdk } from "./sdk-loader";
import { houstonToolServerLost } from "./tool-server-lost";
import { sdkProjectSlug } from "./transcript-files";
import { endTurnIfRequested } from "./turn-end-hook";

const { built } = vi.hoisted(() => ({
  built: [] as { baseOptions: Options }[],
}));
vi.mock("./session", () => ({
  ClaudeSession: class {
    constructor(deps: { baseOptions: Options }) {
      built.push(deps);
    }
  },
}));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  built.length = 0;
});
const actions = [
  { id: "a", label: "Shorter", message: "Shorten it" },
  { id: "b", label: "Longer", message: "Expand it" },
];

for (const profile of ["local", "pooled"] as const) {
  for (const history of [
    "calls",
    "calls-then-torn",
    "torn-only",
    "text-only",
    "sidechain",
    "fresh",
  ] as const) {
    for (const enabled of [false, true]) {
      test(`${profile}: ${history}, suggestions ${enabled}`, async () => {
        const root = mkdtempSync(join(tmpdir(), "claude-suggestions-"));
        roots.push(root);
        const workspaceDir = join(root, "workspace");
        mkdirSync(workspaceDir);
        const dataDir = join(root, "data");
        mkdirSync(dataDir);
        const layout =
          profile === "pooled"
            ? turnClaudeLayout(root, dataDir, "c")
            : {
                configDir: join(root, "claude"),
                sessionsFile: join(dataDir, "sessions.json"),
              };
        if (history !== "fresh") {
          mkdirSync(dirname(layout.sessionsFile), { recursive: true });
          writeFileSync(layout.sessionsFile, JSON.stringify({ c: "s" }));
          // A foreign cwd also exercises lookup after pooled workspace relocation.
          const transcriptDir = join(
            layout.configDir,
            "projects",
            sdkProjectSlug("/old/workspace"),
          );
          mkdirSync(transcriptDir, { recursive: true });
          // A quit mid-append leaves a torn last line that names the tool.
          const torn =
            '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__houston__suggest_actions"';
          writeFileSync(
            join(transcriptDir, "s.jsonl"),
            history === "torn-only"
              ? torn
              : `${JSON.stringify({
                  type: "assistant",
                  isSidechain: history === "sidechain",
                  message: {
                    content:
                      history === "text-only"
                        ? [
                            {
                              type: "text",
                              text: "mcp__houston__suggest_actions",
                            },
                          ]
                        : [
                            {
                              type: "tool_use",
                              id: "t",
                              name: "mcp__houston__suggest_actions",
                              input: { actions },
                            },
                          ],
                  },
                })}\n${history === "calls-then-torn" ? torn : ""}`,
          );
        }
        const sdk = await loadedClaudeSdk(preloadClaudeSdk());
        let tools: SdkMcpToolDefinition[] = [];
        const captureSdk = {
          ...sdk,
          createSdkMcpServer: (
            options: Parameters<typeof sdk.createSdkMcpServer>[0],
          ) => {
            tools = options.tools ?? [];
            return sdk.createSdkMcpServer(options);
          },
        };
        const credential = {
          provider: "anthropic",
          kind: "oauth",
          access: "sk-ant-oat01-test",
          expires: Date.now() + 3600000,
          accountId: null,
        } as const;
        applyServedCredential(join(dataDir, "auth.json"), credential);
        const backend =
          profile === "local"
            ? createClaudeBackend({
                workspaceDir,
                layout,
                readToken: () => ({
                  kind: "oauth-token",
                  value: "sk-ant-oat01-test",
                }),
                systemPrompt: "system",
                toolSelection: { toolNames: [], includeRunCode: false },
                sdk: captureSdk,
              })
            : createTurnBackend("anthropic", {
                directories: { workspaceDir, dataDir, turnRoot: root },
                turn: turnSessionRequest(
                  {
                    workspaceId: "ws",
                    agentId: "agent",
                    conversationId: "c",
                    text: "shorten it",
                    gcsPrefix: "test",
                    credential,
                    nextStepSuggestions: enabled,
                  },
                  "t2",
                  () => {},
                  new AbortController().signal,
                ),
                modelRuntime: await ModelRuntime.create({
                  authPath: join(root, "unused-auth.json"),
                  modelsPath: null,
                  modelsStorePath: join(root, "models-cache.json"),
                  refreshOnCreate: false,
                }),
                toolSelection: { toolNames: [], includeRunCode: false },
                codeSandbox: null,
                systemPrompt: "system",
                claudeSdk: captureSdk,
              });
        const session = await backend.createSession({
          conversationId: "c",
          model: {
            provider: "anthropic",
            id: "claude-sonnet-4-6",
            contextWindow: 200000,
          },
          nextStepSuggestions: enabled,
        });
        const tool = tools.find((t) => t.name === "suggest_actions");
        expect(!!tool).toBe(
          enabled || history === "calls" || history === "calls-then-torn",
        );
        if (!tool) return;
        const normal = makeSuggestActionsTool();
        if (enabled) expect(tool.description).toBe(normal.description);
        expect(z.toJSONSchema(z.object(tool.inputSchema))).toEqual(
          z.toJSONSchema(z.object(toZodShape(normal.parameters))),
        );
        expect(built.at(-1)?.baseOptions.allowedTools).toContain(
          "mcp__houston__suggest_actions",
        );
        const holder = newInteractionHolder();
        holder.finish.noteAssistantMessageStart();
        holder.finish.noteAssistantText("Done.");
        await runWithInteractionCapture(holder, async () => {
          const result = await tool.handler({ actions }, {});
          expect(result.isError).not.toBe(true);
          expect(
            houstonToolServerLost(
              {
                type: "user",
                session_id: "s",
                message: {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: "t",
                      is_error: result.isError,
                      content: result.content
                        .filter((part) => part.type === "text")
                        .map((part) => ({
                          type: "text" as const,
                          text: part.text,
                        })),
                    },
                  ],
                },
                parent_tool_use_id: null,
              },
              built.at(-1)?.baseOptions.allowedTools,
            ),
          ).toBe(false);
          if (enabled) {
            expect(holder.suggestActions?.actions).toEqual(actions);
            expect(holder.finish.turnEndedByTool).toBe(true);
          } else {
            expect(result.content).toEqual([
              { type: "text", text: "Success. Your turn is complete." },
            ]);
            expect(holder.suggestActions).toBeUndefined();
            expect(holder.pending).toBeUndefined();
            // The reply is already written: the turn must end here, or the
            // SDK calls the model again and it repeats the reply.
            expect(holder.finish.turnEndedByTool).toBe(true);
            expect(
              await endTurnIfRequested(
                {
                  hook_event_name: "PostToolBatch",
                  session_id: "s",
                  transcript_path: "",
                  cwd: workspaceDir,
                  tool_calls: [],
                },
                undefined,
                { signal: new AbortController().signal },
              ),
            ).toMatchObject({ continue: false });
            const early = newInteractionHolder();
            await runWithInteractionCapture(early, async () => {
              const before = await tool.handler({ actions }, {});
              expect(before.content).toEqual([
                {
                  type: "text",
                  text: "Success. Write your reply to the user now, then end your turn.",
                },
              ]);
              expect(early.finish.turnEndedByTool).toBe(false);
              expect(early.suggestActions).toBeUndefined();
            });
            const oneShotText = vi.fn(async () => JSON.stringify({ actions }));
            await recoverFollowUpActions({
              session: {
                ...session,
                oneShotText,
                followUpPassServed: () => true,
              },
              interaction: holder,
              conversationId: "c",
              turnId: "t2",
              nextStepSuggestions: false,
              planMode: false,
              userText: "shorten it",
              assistantText: "Done.",
              failed: false,
              isStopped: () => false,
            });
            expect(oneShotText).not.toHaveBeenCalled();
            expect(holder.pending).toBeUndefined();
          }
        });
      });
    }
  }
}
