import {
  type FakeHost,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import { AGENTS_SCOPE, type AgentsViewModel } from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { type Harness, makeSdk, resetHost, startHost, until } from "./harness";

let host: FakeHost;

beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host.stop();
});

let h: Harness;
beforeEach(async () => {
  await resetHost(host.url);
  h = makeSdk(host.url);
});
afterEach(() => {
  h.sdk.dispose();
});

const agentsVm = (): AgentsViewModel | undefined =>
  h.sdk.getSnapshot(AGENTS_SCOPE) as AgentsViewModel | undefined;

describe("agents VM", () => {
  it("loads the seed agent into a pinned snapshot shape", async () => {
    await h.sdk.agents.refresh();

    expect(agentsVm()).toEqual({
      loaded: true,
      items: [
        {
          id: SEED_AGENT_ID,
          name: SEED_AGENT_NAME,
          workspaceId: SEED_WORKSPACE_ID,
          createdAt: Date.UTC(2024, 0, 1),
        },
      ],
    });
  });

  it("live-updates on an external AgentsChanged (another client created one)", async () => {
    await h.sdk.agents.refresh();
    await until(() => agentsVm()?.items.length === 1, "seed loaded");

    const res = await fetch(`${host.url}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Orion" }),
    });
    expect(res.ok).toBe(true);

    await until(
      () => agentsVm()?.items.length === 2,
      "AgentsChanged refetch grew the list to 2",
    );
    expect(agentsVm()?.items.map((a) => a.name)).toContain("Orion");
  });

  it("refetches after a facade create so the snapshot reflects the server", async () => {
    await h.sdk.agents.create("Atlas");
    await until(() => agentsVm()?.items.length === 2, "created agent present");
    expect(agentsVm()?.items.map((a) => a.name)).toContain("Atlas");
  });
});

describe("agents scope key", () => {
  it("is 'agents'", () => {
    expect(AGENTS_SCOPE).toBe("agents");
  });
});
