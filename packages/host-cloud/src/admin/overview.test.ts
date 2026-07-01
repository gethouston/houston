import type { Agent, Workspace } from "@houston/host/src/domain/types";
import { expect, test } from "vitest";
import type { AutopilotRates } from "./billing";
import type { ClusterSnapshot, PodInfo, VolumeInfo } from "./cluster";
import { buildBillingReport, buildOverview } from "./overview";

const RATES: AutopilotRates = {
  vcpuHourUsd: 0.0445,
  memGiBHourUsd: 0.0049,
  pdGiBMonthUsd: 0.1,
  clusterHourUsd: 0.1,
};

function ws(id: string, owner: string, slug: string): Workspace {
  return {
    id,
    ownerUserId: owner,
    kind: "personal",
    runtime: "gke",
    name: "Personal",
    slug,
    createdAt: 1,
  } as const;
}
function agent(id: string, workspaceId: string, name: string): Agent {
  return { id, workspaceId, name, createdAt: 1 };
}
function pod(
  agentId: string,
  workspaceId: string,
  ns: string,
  phase: string,
): PodInfo {
  return {
    workspaceId,
    agentId,
    namespace: ns,
    podName: `agent-${agentId}`,
    phase,
    ready: phase === "Running",
    nodeName: phase === "Running" ? "node-1" : null,
    startedAt: phase === "Running" ? "2026-06-08T00:00:00.000Z" : null,
    restarts: 0,
    cpuRequestCores: 0.25,
    memRequestBytes: 512 * 1024 * 1024,
  };
}
function vol(agentId: string, workspaceId: string, ns: string): VolumeInfo {
  return {
    workspaceId,
    agentId,
    namespace: ns,
    pvcName: `agent-${agentId}-data`,
    storageRequestBytes: 10 * 1024 ** 3,
  };
}

test("buildOverview joins agents to their pods and derives per-agent state", () => {
  const workspaces = [ws("w1", "alice", "alice"), ws("w2", "bob", "bob")];
  const agents = [
    agent("a1", "w1", "Sales"), // running pod
    agent("a2", "w1", "HR"), // slept: PVC but no pod
    agent("a3", "w2", "Scout"), // never started: nothing
  ];
  const snapshot: ClusterSnapshot = {
    pods: [pod("a1", "w1", "ws-alice", "Running")],
    volumes: [vol("a1", "w1", "ws-alice"), vol("a2", "w1", "ws-alice")],
  };

  const ov = buildOverview(workspaces, agents, snapshot, RATES, 1000);

  expect(ov.totals.users).toBe(2);
  expect(ov.totals.agents).toBe(3);
  expect(ov.totals.pods).toEqual({
    running: 1,
    pending: 0,
    other: 0,
    total: 1,
  });

  const alice = ov.users.find((u) => u.userId === "alice");
  if (!alice) throw new Error("alice not found in overview");
  const stateOf = (name: string) =>
    alice.agents.find((a) => a.name === name)?.state;
  expect(stateOf("Sales")).toBe("running");
  expect(stateOf("HR")).toBe("asleep"); // PVC exists, no pod
  const bob = ov.users.find((u) => u.userId === "bob");
  if (!bob) throw new Error("bob not found in overview");
  expect(bob.agents.find((a) => a.name === "Scout")?.state).toBe("absent"); // nothing

  // Alice has one running agent; its pod view carries the requests.
  expect(alice.runningAgents).toBe(1);
  const sales = alice.agents.find((a) => a.name === "Sales");
  if (!sales) throw new Error("Sales agent not found in alice's agents");
  expect(sales.pod).toMatchObject({
    phase: "Running",
    cpuRequestCores: 0.25,
    memRequestMiB: 512,
  });
  expect(sales.storageGiB).toBe(10);
});

test("buildOverview surfaces orphan pods/volumes that match no known agent", () => {
  const workspaces = [ws("w1", "alice", "alice")];
  const agents = [agent("a1", "w1", "Sales")];
  const snapshot: ClusterSnapshot = {
    // a leaked pod for a deleted agent + a labelless pod
    pods: [
      pod("ghost", "w1", "ws-alice", "Running"),
      pod("a1", "w1", "ws-alice", "Running"),
    ],
    volumes: [vol("ghost", "w1", "ws-alice")],
  };
  const ov = buildOverview(workspaces, agents, snapshot, RATES, 1);
  expect(ov.orphans.pods.map((p) => p.agentId)).toEqual(["ghost"]);
  expect(ov.orphans.volumes.map((v) => v.agentId)).toEqual(["ghost"]);
  // Cluster total counts BOTH pods; the orphan cost is non-zero and surfaced.
  expect(ov.totals.pods.total).toBe(2);
  expect(ov.orphans.cost.perHourUsd).toBeGreaterThan(0);
});

test("buildOverview sorts users by monthly cost desc", () => {
  const workspaces = [ws("w1", "cheap", "cheap"), ws("w2", "pricey", "pricey")];
  const agents = [
    agent("a1", "w1", "x"),
    agent("a2", "w2", "y"),
    agent("a3", "w2", "z"),
  ];
  const snapshot: ClusterSnapshot = {
    pods: [
      pod("a1", "w1", "ws-cheap", "Running"),
      pod("a2", "w2", "ws-pricey", "Running"),
      pod("a3", "w2", "ws-pricey", "Running"),
    ],
    volumes: [],
  };
  const ov = buildOverview(workspaces, agents, snapshot, RATES, 1);
  expect(ov.users.map((u) => u.userId)).toEqual(["pricey", "cheap"]);
});

test("buildBillingReport maps actuals to users by namespace and flags status", () => {
  const workspaces = [ws("w1", "alice", "alice")];
  const agents = [agent("a1", "w1", "Sales")];
  const snapshot: ClusterSnapshot = {
    pods: [pod("a1", "w1", "ws-alice", "Running")],
    volumes: [],
  };
  const ov = buildOverview(workspaces, agents, snapshot, RATES, 1);

  // not configured
  const none = buildBillingReport(
    ov,
    RATES,
    null,
    "not-configured",
    undefined,
    5,
  );
  expect(none.actuals).toBeNull();
  expect(none.actualsStatus).toBe("not-configured");
  expect(none.estimate.byUser[0]?.actualUsd).toBeNull();
  expect(none.estimate.clusterFeeMonthUsd).toBeCloseTo(73, 0);

  // with actuals: alice's namespace cost is attached
  const withActuals = buildBillingReport(
    ov,
    RATES,
    {
      source: "bigquery",
      rangeDays: 30,
      startDate: "2026-05-09",
      endDate: "2026-06-08",
      currency: "USD",
      totalUsd: 9.99,
      byNamespace: [{ namespace: "ws-alice", netCostUsd: 9.99 }],
    },
    "ok",
    undefined,
    5,
  );
  expect(withActuals.actualsStatus).toBe("ok");
  expect(withActuals.estimate.byUser[0]?.actualUsd).toBe(9.99);

  // error path carries the message
  const errored = buildBillingReport(
    ov,
    RATES,
    null,
    "error",
    "permission denied",
    5,
  );
  expect(errored.actualsStatus).toBe("error");
  expect(errored.actualsError).toBe("permission denied");
});
