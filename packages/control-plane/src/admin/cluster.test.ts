import { test, expect } from "bun:test";
import type { V1PersistentVolumeClaim, V1Pod } from "@kubernetes/client-node";
import { FakeClusterReader, toPodInfo, toVolumeInfo } from "./cluster";

test("toPodInfo reads tenancy labels, phase, requests, restarts and normalises startTime", () => {
  const raw = {
    metadata: {
      name: "agent-a1",
      namespace: "ws-alice",
      labels: {
        "houston.ai/workspace": "ws1",
        "houston.ai/agent": "a1",
        "app.kubernetes.io/managed-by": "houston-control-plane",
      },
    },
    spec: {
      nodeName: "gke-node-7",
      containers: [
        { name: "runtime", resources: { requests: { cpu: "250m", memory: "512Mi" } } },
      ],
    },
    status: {
      phase: "Running",
      startTime: new Date("2026-06-08T12:00:00.000Z"),
      containerStatuses: [{ name: "runtime", ready: true, restartCount: 2 }],
    },
  } as unknown as V1Pod;

  const info = toPodInfo(raw);
  expect(info.workspaceId).toBe("ws1");
  expect(info.agentId).toBe("a1");
  expect(info.namespace).toBe("ws-alice");
  expect(info.phase).toBe("Running");
  expect(info.ready).toBe(true);
  expect(info.nodeName).toBe("gke-node-7");
  expect(info.startedAt).toBe("2026-06-08T12:00:00.000Z");
  expect(info.restarts).toBe(2);
  expect(info.cpuRequestCores).toBe(0.25);
  expect(info.memRequestBytes).toBe(512 * 1024 * 1024);
});

test("toPodInfo: a Pending pod with no containerStatuses is not ready and has null start", () => {
  const raw = {
    metadata: { name: "p", namespace: "ws-x", labels: {} },
    spec: { containers: [] },
    status: { phase: "Pending" },
  } as unknown as V1Pod;
  const info = toPodInfo(raw);
  expect(info.phase).toBe("Pending");
  expect(info.ready).toBe(false);
  expect(info.startedAt).toBeNull();
  expect(info.nodeName).toBeNull();
  expect(info.workspaceId).toBeNull();
  expect(info.agentId).toBeNull();
  expect(info.restarts).toBe(0);
});

test("toPodInfo sums requests across multiple containers", () => {
  const raw = {
    metadata: { name: "p", namespace: "ws-x", labels: { "houston.ai/agent": "a" } },
    spec: {
      containers: [
        { resources: { requests: { cpu: "250m", memory: "512Mi" } } },
        { resources: { requests: { cpu: "500m", memory: "256Mi" } } },
      ],
    },
    status: { phase: "Running", containerStatuses: [{ ready: true, restartCount: 0 }, { ready: true, restartCount: 1 }] },
  } as unknown as V1Pod;
  const info = toPodInfo(raw);
  expect(info.cpuRequestCores).toBe(0.75);
  expect(info.memRequestBytes).toBe((512 + 256) * 1024 * 1024);
  expect(info.restarts).toBe(1);
});

test("toVolumeInfo prefers bound capacity, falls back to the request", () => {
  const requested = {
    metadata: { name: "agent-a1-data", namespace: "ws-alice", labels: { "houston.ai/agent": "a1" } },
    spec: { resources: { requests: { storage: "10Gi" } } },
  } as unknown as V1PersistentVolumeClaim;
  expect(toVolumeInfo(requested).storageRequestBytes).toBe(10 * 1024 ** 3);

  const bound = {
    metadata: { name: "agent-a1-data", namespace: "ws-alice", labels: { "houston.ai/agent": "a1" } },
    spec: { resources: { requests: { storage: "10Gi" } } },
    status: { capacity: { storage: "16Gi" } },
  } as unknown as V1PersistentVolumeClaim;
  expect(toVolumeInfo(bound).storageRequestBytes).toBe(16 * 1024 ** 3);
});

test("FakeClusterReader returns its fixed snapshot", async () => {
  const reader = new FakeClusterReader({ pods: [], volumes: [] });
  expect(await reader.snapshot()).toEqual({ pods: [], volumes: [] });
});
