import { beforeEach, expect, test, vi } from "vitest";

const settle = vi.hoisted(() => vi.fn());
vi.mock("./mission-settle", () => ({ reportMissionSettle: settle }));
vi.mock("../store/conversations", () => ({
  appendAssistantMessage: vi.fn(),
  stampSessionReplay: vi.fn(),
}));

const { settleStoppedBeforePrompt } = await import(
  "./turn-stopped-before-prompt"
);

beforeEach(() => settle.mockClear());

test("a turn stopped before the prompt settles as stopped, so it never pushes", () => {
  settleStoppedBeforePrompt("conv-1", "turn-1", {
    replayedHistory: false,
    providerSwitch: undefined,
    compaction: undefined,
    modelCalls: undefined,
  });

  expect(settle).toHaveBeenCalledWith(
    "conv-1",
    "needs_you",
    null,
    "turn-1",
    true,
    undefined,
  );
});
