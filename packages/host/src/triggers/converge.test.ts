import { createRoutine, saveRoutines } from "@houston/domain";
import type { Routine, RoutineTriggerBinding } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { FakeIntegrationProvider } from "../integrations/fake";
import { MemoryIntegrationGrantStore } from "../integrations/grant-store";
import { LocalIntegrationGrants } from "../integrations/grants";
import { IntegrationRegistry } from "../integrations/registry";
import { NoConnectedAccountError } from "../integrations/types";
import { MemoryVfs } from "../vfs";
import { type ConvergeDeps, reconcileAgentTriggers } from "./converge";
import { MemoryTriggerStateStore } from "./state-store";

const AGENT = "Personal/Helper";
const gmail: RoutineTriggerBinding = {
  toolkit: "gmail",
  trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
  trigger_config: { label: "inbox" },
};

let vfs: MemoryVfs;
let state: MemoryTriggerStateStore;
let provider: FakeIntegrationProvider;

function routine(over: Partial<Routine> & { id: string }): Routine {
  return {
    ...createRoutine(
      {
        name: over.name ?? over.id,
        prompt: "do",
        trigger: over.trigger ?? gmail,
      },
      over.id,
      "2026-01-01T00:00:00Z",
    ),
    ...over,
  };
}

async function seed(routines: Routine[]): Promise<void> {
  await saveRoutines(vfs, AGENT, routines);
}

function deps(over: Partial<ConvergeDeps> = {}): ConvergeDeps {
  return {
    vfs,
    provider,
    state,
    userId: "local-owner",
    ...over,
  };
}

beforeEach(() => {
  vfs = new MemoryVfs();
  state = new MemoryTriggerStateStore();
  provider = new FakeIntegrationProvider();
});

test("provisions an enabled trigger routine (create → active)", async () => {
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const s = await state.get(AGENT);
  expect(s.r1?.status).toBe("active");
  expect(s.r1?.trigger_instance_id).toBeTruthy();
  expect(
    provider.triggerInstance(s.r1?.trigger_instance_id ?? "")?.status,
  ).toBe("enable");
});

test("is idempotent: an unchanged routine keeps its instance id", async () => {
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const first = (await state.get(AGENT)).r1?.trigger_instance_id;
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  expect((await state.get(AGENT)).r1?.trigger_instance_id).toBe(first);
});

test("a config change recreates: the stored hash updates", async () => {
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const before = (await state.get(AGENT)).r1?.config_hash;

  await seed([
    routine({
      id: "r1",
      trigger: { ...gmail, trigger_config: { label: "starred" } },
    }),
  ]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const after = (await state.get(AGENT)).r1;
  expect(after?.config_hash).not.toBe(before);
  expect(after?.status).toBe("active");
});

test("a disabled routine disables (not deletes) its instance", async () => {
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const id = (await state.get(AGENT)).r1?.trigger_instance_id ?? "";

  await seed([routine({ id: "r1", enabled: false })]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const s = await state.get(AGENT);
  expect(s.r1?.status).toBe("disabled");
  expect(s.r1?.trigger_instance_id).toBe(id); // retained
  expect(provider.triggerInstance(id)?.status).toBe("disable");
});

test("a removed trigger routine deletes its instance and drops the entry", async () => {
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  const id = (await state.get(AGENT)).r1?.trigger_instance_id ?? "";

  await seed([]); // routine gone
  await reconcileAgentTriggers(deps(), AGENT, AGENT);
  expect((await state.get(AGENT)).r1).toBeUndefined();
  expect(provider.triggerInstance(id)).toBeUndefined();
});

test("an ungranted toolkit is not provisioned (paused_revoked)", async () => {
  const grants = new LocalIntegrationGrants({
    store: new MemoryIntegrationGrantStore(),
    registry: new IntegrationRegistry(),
  });
  // A stored record that excludes gmail → the toolkit is not granted.
  await grants.replace(AGENT, ["slack"]);
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps({ grants }), AGENT, AGENT);
  const s = await state.get(AGENT);
  expect(s.r1?.status).toBe("paused_revoked");
  expect(s.r1?.trigger_instance_id).toBe("");
});

test("a missing connection surfaces paused_disconnected without stalling the loop", async () => {
  const throwing = new FakeIntegrationProvider();
  throwing.upsertTriggerInstance = async (_u, b) => {
    if (b.toolkit === "gmail") throw new NoConnectedAccountError("gmail");
    return { triggerInstanceId: "ti-ok" };
  };
  await seed([
    routine({ id: "r1" }),
    routine({
      id: "r2",
      trigger: { ...gmail, toolkit: "github", trigger_slug: "GITHUB_X" },
    }),
  ]);
  await reconcileAgentTriggers(deps({ provider: throwing }), AGENT, AGENT);
  const s = await state.get(AGENT);
  expect(s.r1?.status).toBe("paused_disconnected");
  // The second routine still provisioned — one bad routine never stalls the rest.
  expect(s.r2?.status).toBe("active");
});

test("a Composio error is captured as status:error, never thrown", async () => {
  const throwing = new FakeIntegrationProvider();
  throwing.upsertTriggerInstance = async () => {
    throw new Error("composio 500");
  };
  await seed([routine({ id: "r1" })]);
  await reconcileAgentTriggers(deps({ provider: throwing }), AGENT, AGENT);
  const s = await state.get(AGENT);
  expect(s.r1?.status).toBe("error");
  expect(s.r1?.detail).toContain("composio 500");
});
