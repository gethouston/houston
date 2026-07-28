import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * HOU-979 — provider calls must be routed at the ACTIVE SPACE's agent, or not
 * routed at all.
 *
 * Provider connects and probes go to a specific agent's runtime. The only
 * space-validated source for that id is the client's `agentList`, the set the
 * CURRENT space's last `listAgents` returned; the persisted `last_agent_id` pref
 * is not space-aware, so right after a switch it still names the PREVIOUS
 * space's agent. Routing on it produces `/v1/agents/<other-space-agent>/…` under
 * the new `x-houston-org` — a 404/403 that surfaced as "no providers in the
 * picker" and a reconnect card that never cleared.
 *
 * These tests pin the rules that close it:
 *   1. an unsettled agent list makes the PROBE report "unknown" (checking) with
 *      no cross-space request at all;
 *   2. an unsettled agent list makes every provider WRITE refuse rather than
 *      guess;
 *   3. once settled, the id used is the validated one — the stale pref is
 *      ignored in favor of the space's own agent;
 *   4. SWITCHING SPACES un-settles it again, so the guard is not first-boot-only
 *      (a Connect clicked mid-switch used to route at the space just left); and
 *   5. strictness applies only while a list is still EXPECTED — a list that
 *      failed, or one that will never be asked for, degrades to the pref-based
 *      routing instead of bricking connect + the picker forever.
 */

const { listProviders, cpListAgents, forgetCredential, runtimeLogout } =
  vi.hoisted(() => ({
    listProviders: vi.fn(),
    cpListAgents: vi.fn(),
    forgetCredential: vi.fn(),
    runtimeLogout: vi.fn(),
  }));

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    listAgents: cpListAgents,
    forgetCredential,
    runtimeClientFor: vi.fn(() => ({
      listProviders,
      logout: runtimeLogout,
    })),
  };
});

import { HoustonClient } from "../src/engine-adapter/client";

const PREF = "houston.pref.last_agent_id";

/** The agent the user last selected — in the space they have just LEFT. */
const STALE_PREF_AGENT = "agent-from-the-other-space";
/** The only agent the space we are now in actually has. */
const THIS_SPACE_AGENT = "agent-in-this-space";

beforeEach(() => {
  vi.useFakeTimers();
  const store = new Map<string, string>([[PREF, STALE_PREF_AGENT]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  listProviders
    .mockReset()
    .mockResolvedValue([{ id: "anthropic", configured: true }]);
  cpListAgents.mockReset().mockResolvedValue([{ id: THIS_SPACE_AGENT }]);
  forgetCredential.mockReset().mockResolvedValue(undefined);
  runtimeLogout.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function client() {
  return new HoustonClient({
    baseUrl: "http://gateway",
    token: "t",
    controlPlane: true,
  });
}

test("the probe reports UNKNOWN, and makes no request, before the space's agents settle", async () => {
  const statuses = await client().providerStatuses(["anthropic"]);

  // "checking", not a fabricated answer either way…
  expect(statuses.map((s) => s.authState)).toEqual(["unknown"]);
  // …and, crucially, nothing was asked of the previous space's agent.
  expect(listProviders).not.toHaveBeenCalled();
});

test("the probe runs once the space's agents have settled", async () => {
  const c = client();
  await c.listAgents("ws");

  const statuses = await c.providerStatuses(["anthropic"]);

  expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
  expect(listProviders).toHaveBeenCalledTimes(1);
});

test("a provider WRITE refuses before the space's agents settle, rather than guessing", async () => {
  await expect(client().providerLogout("anthropic")).rejects.toThrow(
    /still loading/i,
  );
  expect(forgetCredential).not.toHaveBeenCalled();

  await expect(
    client().setProviderApiKey("opencode", "sk-test"),
  ).rejects.toThrow(/still loading/i);

  await expect(client().providerLogin("anthropic")).rejects.toThrow(
    /still loading/i,
  );
});

test("a settled write targets the SPACE's agent, never the stale pref", async () => {
  const c = client();
  await c.listAgents("ws");

  await c.providerLogout("anthropic");

  // `listAgents` prunes the pref (it names an agent this space doesn't have),
  // and the write routes at the space's own agent.
  expect(localStorage.getItem(PREF)).toBeNull();
  for (const call of forgetCredential.mock.calls) {
    expect(call[1]).toBe(THIS_SPACE_AGENT);
  }
  expect(forgetCredential).toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// (4) A SPACE SWITCH un-settles routing again.
//
// The guard read "have we ever loaded a list?", and nothing ever cleared that
// list — so it only ever protected the first boot. Click Connect during a
// switch and the write still went to the space the user had just left, under
// the NEW org header.
// ---------------------------------------------------------------------------

const ORG_A = "00000000000000aa";
const ORG_B = "00000000000000bb";
/** The agent that exists in space A — and NOT in space B. */
const AGENT_IN_A = "agent-in-space-a";
/** The agent space B has. */
const AGENT_IN_B = "agent-in-space-b";

test("switching spaces un-settles routing until the NEW space's list lands", async () => {
  const c = client();

  // In space A, with A's list loaded: routing is settled and writes work.
  c.setActiveOrg(ORG_A);
  cpListAgents.mockResolvedValue([{ id: AGENT_IN_A }]);
  await c.listAgents("ws");
  expect((await c.providerStatuses(["anthropic"]))[0].authState).toBe(
    "authenticated",
  );

  // The user switches to space B. B's `listAgents` has not resolved yet, and
  // the only id we hold belongs to A.
  c.setActiveOrg(ORG_B);
  listProviders.mockClear();

  // The probe reports "checking" and asks NOTHING of A's agent…
  const midSwitch = await c.providerStatuses(["anthropic"]);
  expect(midSwitch.map((s) => s.authState)).toEqual(["unknown"]);
  expect(listProviders).not.toHaveBeenCalled();

  // …and a Connect clicked right now refuses instead of writing into A.
  forgetCredential.mockClear();
  await expect(c.providerLogout("anthropic")).rejects.toThrow(/still loading/i);
  expect(forgetCredential).not.toHaveBeenCalled();

  // Once B's list lands, routing settles again — at B's OWN agent.
  cpListAgents.mockResolvedValue([{ id: AGENT_IN_B }]);
  await c.listAgents("ws");
  expect((await c.providerStatuses(["anthropic"]))[0].authState).toBe(
    "authenticated",
  );
  await c.providerLogout("anthropic");
  for (const call of forgetCredential.mock.calls) {
    expect(call[1]).toBe(AGENT_IN_B);
  }
});

test("re-pinning the SAME space does not un-settle a loaded list", async () => {
  // `lib/engine.ts` re-applies the recorded active space on every client
  // rebuild / bearer rotation. That must not be read as a switch, or a token
  // refresh would drop routing mid-session.
  const c = client();
  c.setActiveOrg(ORG_A);
  await c.listAgents("ws");

  c.setActiveOrg(ORG_A);

  expect((await c.providerStatuses(["anthropic"]))[0].authState).toBe(
    "authenticated",
  );
});

// ---------------------------------------------------------------------------
// (5) A list that is NOT COMING must degrade, never brick.
//
// The regression the strictness introduced: one failed `listAgents` at boot
// left routing "not loaded yet" forever. The probe skipped itself on every
// call (a permanent "Loading providers…") and every connect / sign-out threw
// "still loading", with no retry anywhere. A failure is not a pending load.
// ---------------------------------------------------------------------------

test("a FAILED agent list degrades to pref-based routing instead of bricking", async () => {
  const c = client();
  cpListAgents.mockRejectedValue(new Error("gateway blew up"));

  // The failure still reaches the caller — it is surfaced, not swallowed.
  await expect(c.listAgents("ws")).rejects.toThrow(/gateway blew up/);

  // The probe RUNS (no permanent "checking"), through the persisted selection.
  const statuses = await c.providerStatuses(["anthropic"]);
  expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
  expect(listProviders).toHaveBeenCalledTimes(1);

  // …and connect / sign-out work again rather than throwing "still loading".
  await c.providerLogout("anthropic");
  expect(forgetCredential).toHaveBeenCalled();
  for (const call of forgetCredential.mock.calls) {
    expect(call[1]).toBe(STALE_PREF_AGENT);
  }
});

test("a later SUCCESSFUL list restores strict validation after a failure", async () => {
  const c = client();
  cpListAgents.mockRejectedValueOnce(new Error("blip"));
  await expect(c.listAgents("ws")).rejects.toThrow(/blip/);

  // The retry succeeds: the pref is pruned and writes route at the real agent.
  await c.listAgents("ws");

  forgetCredential.mockClear();
  await c.providerLogout("anthropic");
  expect(localStorage.getItem(PREF)).toBeNull();
  for (const call of forgetCredential.mock.calls) {
    expect(call[1]).toBe(THIS_SPACE_AGENT);
  }
});

test("a failure never downgrades a list we already have", async () => {
  // A background refresh failing is not a reason to drop validation we can
  // still do — the ids from the last good list are still this space's ids.
  const c = client();
  await c.listAgents("ws");
  cpListAgents.mockRejectedValueOnce(new Error("blip"));
  await expect(c.listAgents("ws")).rejects.toThrow(/blip/);

  forgetCredential.mockClear();
  await c.providerLogout("anthropic");
  for (const call of forgetCredential.mock.calls) {
    expect(call[1]).toBe(THIS_SPACE_AGENT);
  }
});

test("noteAgentsUnavailable settles routing when no list will ever be asked for", async () => {
  // Boot resolved NO workspace (the workspace load failed), so `listAgents` is
  // never called at all. Without this the picker and the AI hub spin forever on
  // a list that cannot arrive.
  const c = client();

  c.noteAgentsUnavailable();

  const statuses = await c.providerStatuses(["anthropic"]);
  expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
  await c.providerLogout("anthropic");
  expect(forgetCredential).toHaveBeenCalled();
});
