import { expect, test, vi } from "vitest";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { TurnSetupError } from "./turn-layout";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import { createTurnSandbox } from "./turn-sandbox-startup";
import type { resolveTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

vi.mock("./turn-sandbox", () => ({ makeTurnSandboxFetch: vi.fn(() => ({})) }));

const turn = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "assistant",
  text: "hi",
  gcsPrefix: "ws/acme/a551abc",
  credential: null,
  hostToken: "turn-v1.x.y",
  actingAs: { userId: "owner-1" },
  grant: {
    url: "https://gateway.test",
    token: "acting-v1.x.y",
    expires: 4102444800,
    scopes: ["agent-writes"],
  },
  coordinator: { token: "assistant-turn-v1.x.y", expires: 4102444800 },
} as TurnRequest;

test("Houston's turn on a non-standing tree fails at setup", () => {
  expect(() =>
    createTurnSandbox({
      deps: {} as TurnServerDeps,
      turn,
      identity: { org: "acme", agent: "a551abc" },
      resolved: { store: {}, prefix: "ws/acme/a551abc" } as ReturnType<
        typeof resolveTurnStore
      >,
      filesystem: {
        kind: "cloudrun",
        workspaceRel: "workspace",
        dataRel: "data",
      } as TurnFilesystem,
    }),
  ).toThrow(TurnSetupError);
});

test("the turn's plan limits reach its sandbox's routine writes", () => {
  createTurnSandbox({
    deps: {} as TurnServerDeps,
    turn: {
      ...turn,
      coordinator: undefined,
      limits: { routineMinIntervalMinutes: 15 },
    },
    identity: { org: "acme", agent: "a551abc" },
    resolved: { store: {}, prefix: "ws/acme/a551abc" } as ReturnType<
      typeof resolveTurnStore
    >,
    filesystem: { kind: "cloudrun" } as TurnFilesystem,
  });
  expect(makeTurnSandboxFetch).toHaveBeenCalledWith(
    expect.objectContaining({ limits: { routineMinIntervalMinutes: 15 } }),
  );
});
