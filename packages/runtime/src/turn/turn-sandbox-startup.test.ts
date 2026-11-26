import { expect, test, vi } from "vitest";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { TurnSetupError } from "./turn-layout";
import { startTurnMissions } from "./turn-missions";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import { createTurnSandbox } from "./turn-sandbox-startup";
import type { resolveTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

// Only what the startup hands the sandbox is under test here.
vi.mock("./turn-sandbox", () => ({ makeTurnSandboxFetch: vi.fn(() => ({})) }));
vi.mock("./turn-missions", () => ({
  startTurnMissions: vi.fn(() => ({ route: () => null })),
}));

/**
 * Houston's routes run the host's handlers over its agent's own tree
 * (`workspaces/<ws>/<agent>`). A turn that hydrated anything else cannot serve
 * them, so it fails at setup instead of answering every call "agent not
 * found" after the model has started.
 */

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

const READY = Promise.resolve();

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
      hydrated: READY,
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
    hydrated: READY,
  });
  expect(makeTurnSandboxFetch).toHaveBeenCalledWith(
    expect.objectContaining({ limits: { routineMinIntervalMinutes: 15 } }),
  );
});

test("an ordinary turn on its own tree mounts its mission family over the gateway", () => {
  const ordinary = {
    ...turn,
    coordinator: undefined,
    actingToken: "acting-v1.x.y",
  };
  const resolved = { store: {}, prefix: "ws/acme/a551abc" } as ReturnType<
    typeof resolveTurnStore
  >;
  const identity = { org: "acme", agent: "a551abc" };
  const standing = { kind: "standing" } as TurnFilesystem;
  const mount = () =>
    vi.mocked(makeTurnSandboxFetch).mock.lastCall?.[0].missions;

  createTurnSandbox({
    deps: {} as TurnServerDeps,
    turn: ordinary,
    identity,
    resolved,
    filesystem: standing,
    hydrated: READY,
  });
  expect(startTurnMissions).toHaveBeenLastCalledWith({
    turn: ordinary,
    actingToken: "acting-v1.x.y",
    gateway: { url: "https://gateway.test", token: "turn-v1.x.y" },
    agentSlug: "a551abc",
    filesystem: standing,
    hydrated: READY,
  });
  expect(mount()).toBeDefined();

  vi.mocked(startTurnMissions).mockClear();
  for (const filesystem of [{ kind: "cloudrun" } as TurnFilesystem, standing])
    createTurnSandbox({
      deps: {} as TurnServerDeps,
      turn:
        filesystem.kind === "cloudrun"
          ? ordinary
          : { ...ordinary, actingToken: undefined },
      identity,
      resolved,
      filesystem,
      hydrated: READY,
    });
  expect(startTurnMissions).not.toHaveBeenCalled();
  expect(mount()).toBeUndefined();
});

test("the gateway's custom sign-in callback reaches the turn's sandbox", () => {
  const customOAuthCallbackUrl =
    "https://gateway.test/v1/integrations/custom/oauth/callback";
  createTurnSandbox({
    deps: {} as TurnServerDeps,
    turn: { ...turn, coordinator: undefined, customOAuthCallbackUrl },
    identity: { org: "acme", agent: "a551abc" },
    resolved: { store: {}, prefix: "ws/acme/a551abc" } as ReturnType<
      typeof resolveTurnStore
    >,
    filesystem: { kind: "cloudrun" } as TurnFilesystem,
    hydrated: READY,
  });
  expect(makeTurnSandboxFetch).toHaveBeenCalledWith(
    expect.objectContaining({ customOAuthCallbackUrl }),
  );
});
