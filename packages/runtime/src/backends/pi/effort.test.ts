import { getModel } from "@earendil-works/pi-ai/compat";
import {
  type AgentSession,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { toThinkingLevel } from "../../ai/effort";
import { createPiBackend } from "./backend";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  createAgentSession: vi.fn(),
}));
vi.mock("../../session/resource-loader", () => ({
  makeAgentLoader: () => ({ reload: async () => {} }),
  SYSTEM_PROMPT: "",
}));
vi.mock("./session-files", () => ({ resumeSessionManager: vi.fn() }));
vi.mock("./transport-settings", () => ({ piTransportSettings: () => ({}) }));

const terra = getModel("openai-codex", "gpt-6.1-terra");
const astra = getModel("openai-codex", "gpt-6-astra");

test.each([
  ["Terra max", terra, "max", "max"],
  ["Terra low", terra, "low", "low"],
  ["Astra max", astra, "max", "xhigh"],
  [
    "max-only catalog model",
    { ...astra, thinkingLevelMap: { xhigh: null, max: "max" } },
    "max",
    "max",
  ],
  [
    "catalog model omitting xhigh",
    { ...astra, thinkingLevelMap: { max: "max" } },
    "max",
    "max",
  ],
  [
    "catalog model without max",
    { ...astra, thinkingLevelMap: { xhigh: null, max: null } },
    "max",
    "xhigh",
  ],
])("%s reaches pi on create and reuse", async (_label, model, effort, expected) => {
  const setThinkingLevel = vi.fn();
  const underlying = {
    model,
    agent: {},
    subscribe: () => () => {},
    setThinkingLevel,
  } as unknown as AgentSession;
  const create = vi.mocked(createAgentSession);
  create.mockClear();
  create.mockResolvedValue({ session: underlying } as Awaited<
    ReturnType<typeof createAgentSession>
  >);
  const backend = createPiBackend({
    workspaceDir: "/tmp/hou175-fixture",
    dataDir: "/tmp/hou175-fixture",
    modelRuntime: {} as never,
    tools: [],
    customTools: [],
  });
  const level = toThinkingLevel(effort);
  if (!level) throw new Error("expected a thinking level");
  const session = await backend.createSession({
    conversationId: "routine-r1",
    model,
    thinkingLevel: level,
  });
  expect(create.mock.calls[0]?.[0]?.thinkingLevel).toBe(expected);
  session.setThinkingLevel(level);
  expect(setThinkingLevel).toHaveBeenCalledWith(expected);
});
