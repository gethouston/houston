import { afterEach, beforeEach, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => {
  const host = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  return {
    buildLocalHost: vi.fn((_options: unknown) => host),
    installParentWatchdog: vi.fn(),
    managedStoreConfig: vi.fn(),
  };
});

/** The slice of LocalHostOptions these tests assert on. */
interface BootedOptions {
  routineSchedulerMode?: string;
  durableTurns?: {
    turnlogGateway?: { baseUrl: string; fence: { token?: string } };
  };
}

vi.mock("@houston/runtime-client/sentry", () => ({
  initEngineSentry: () => undefined,
  installConsoleCapture: vi.fn(),
}));
vi.mock("../capabilities", () => ({
  LOCAL_CAPABILITIES: { profile: "local" },
  MANAGED_CLOUD_CAPABILITIES: { profile: "managed-cloud" },
}));
vi.mock("../houston-prompt", () => ({ houstonSystemPrompt: () => "prompt" }));
vi.mock("../parent-watchdog", () => ({
  installParentWatchdog: harness.installParentWatchdog,
}));
vi.mock("../watch/watcher-race", () => ({
  isBenignRecursiveWatchRace: () => false,
}));
vi.mock("./host", () => ({ buildLocalHost: harness.buildLocalHost }));
vi.mock("./managed-store-config", () => ({
  managedStoreConfig: harness.managedStoreConfig,
}));
vi.mock("./runtime-command", () => ({ runtimeCommand: () => ["runtime"] }));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv("HOUSTON_ROUTINE_SCHEDULER_MODE", "");
  vi.stubEnv("HOUSTON_TRANSCRIPT_DUAL_WRITE", "");
  vi.stubEnv("HOUSTON_TURN_LOG", "");
  vi.stubEnv("HOUSTON_TURNLOG_URL", "");
  harness.managedStoreConfig.mockResolvedValue(undefined);
  vi.spyOn(process, "on").mockImplementation(() => process);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function bootMain(): Promise<BootedOptions> {
  await import("./main");
  const options = harness.buildLocalHost.mock.calls[0]?.[0] as
    | BootedOptions
    | undefined;
  if (!options) throw new Error("expected local host options");
  return options;
}

function managedStore() {
  return {
    podGateway: {
      baseUrl: "https://store.test",
      orgSlug: "acme",
      agentSlug: "writer",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: { token: "store-lease" },
    },
    storeSync: { store: {} },
    sharedMirror: { store: {}, mirrorDir: "/mirror" },
  };
}

test("turnlog gateway owns a fence holder distinct from the object store", async () => {
  const store = managedStore();
  harness.managedStoreConfig.mockResolvedValue(store);
  vi.stubEnv("HOUSTON_TURNLOG_URL", "https://turnlog.test");

  const options = await bootMain();

  expect(options.durableTurns?.turnlogGateway).toMatchObject({
    baseUrl: "https://turnlog.test",
    fence: { token: "store-lease" },
  });
  expect(options.durableTurns?.turnlogGateway?.fence).not.toBe(
    store.podGateway.fence,
  );
});

test("an empty routine scheduler mode uses the local default", async () => {
  vi.stubEnv("HOUSTON_ROUTINE_SCHEDULER_MODE", "");

  const options = await bootMain();

  expect(options.routineSchedulerMode).toBe("local");
});

test("managed boot logs every durable-turn rollout flag state", async () => {
  harness.managedStoreConfig.mockResolvedValue(managedStore());
  vi.stubEnv("HOUSTON_TRANSCRIPT_DUAL_WRITE", "1");

  await bootMain();

  expect(console.info).toHaveBeenCalledWith(
    "[boot] transcript dual-write ON (HOUSTON_TRANSCRIPT_DUAL_WRITE=1)",
  );
  expect(console.info).toHaveBeenCalledWith(
    "[boot] turnlog capture OFF (HOUSTON_TURN_LOG unset)",
  );
});

test("desktop boot emits no durable-turn rollout logs", async () => {
  await bootMain();

  const rolloutLogs = vi
    .mocked(console.info)
    .mock.calls.flat()
    .filter((value) => String(value).startsWith("[boot]"));
  expect(rolloutLogs).toEqual([]);
});
