import { expect, test } from "bun:test";
import {
  type AutopilotRates,
  BigQueryBillingReader,
  estimate,
  HOURS_PER_MONTH,
  podHourlyUsd,
  volumeMonthlyUsd,
} from "./billing";
import type { PodInfo, VolumeInfo } from "./cluster";

const RATES: AutopilotRates = {
  vcpuHourUsd: 0.0445,
  memGiBHourUsd: 0.0049,
  pdGiBMonthUsd: 0.1,
  clusterHourUsd: 0.1,
};

function pod(over: Partial<PodInfo> = {}): PodInfo {
  return {
    workspaceId: "ws1",
    agentId: "a1",
    namespace: "ws-u1",
    podName: "agent-a1",
    phase: "Running",
    ready: true,
    nodeName: "node-1",
    startedAt: "2026-06-08T00:00:00.000Z",
    restarts: 0,
    cpuRequestCores: 0.25,
    memRequestBytes: 512 * 1024 * 1024,
    ...over,
  };
}

function vol(over: Partial<VolumeInfo> = {}): VolumeInfo {
  return {
    workspaceId: "ws1",
    agentId: "a1",
    namespace: "ws-u1",
    pvcName: "agent-a1-data",
    storageRequestBytes: 10 * 1024 ** 3,
    ...over,
  };
}

test("podHourlyUsd = cpu*vcpuRate + memGiB*memRate", () => {
  // 0.25 vCPU * 0.0445 + 0.5 GiB * 0.0049 = 0.011125 + 0.00245 = 0.013575
  expect(podHourlyUsd(pod(), RATES)).toBeCloseTo(0.013575, 6);
});

test("volumeMonthlyUsd = sizeGiB * pdRate", () => {
  expect(volumeMonthlyUsd(vol(), RATES)).toBeCloseTo(1.0, 6); // 10Gi * $0.10
});

test("estimate bills compute only for RUNNING pods, storage always", () => {
  const running = pod({ phase: "Running" });
  const slept = pod({ agentId: "a2", phase: "Pending" }); // not running → no compute
  const r = estimate([running, slept], [vol(), vol({ agentId: "a2" })], RATES);

  const hourly = 0.013575; // one running pod
  expect(r.perHourUsd).toBeCloseTo(hourly, 4);
  // monthly = running-compute*730 + two PVCs of storage ($1 each)
  expect(r.perMonthUsd).toBeCloseTo(hourly * HOURS_PER_MONTH + 2.0, 2);
});

test("estimate of nothing is zero", () => {
  expect(estimate([], [], RATES)).toEqual({ perHourUsd: 0, perMonthUsd: 0 });
});

interface BqRequestBody {
  parameterMode: string;
  query: string;
  queryParameters: {
    name: string;
    parameterType: { type: string };
    parameterValue: { value: string };
  }[];
  [key: string]: unknown;
}

test("BigQueryBillingReader builds a parameterized query and parses net cost per namespace", async () => {
  const calls: { url: string; body: BqRequestBody | null }[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(url),
      body: init?.body
        ? (JSON.parse(init.body as string) as BqRequestBody)
        : null,
    });
    return {
      ok: true,
      async json() {
        return {
          rows: [
            { f: [{ v: "ws-alice" }, { v: "12.5" }, { v: "USD" }] },
            { f: [{ v: "ws-bob" }, { v: "3.25" }, { v: "USD" }] },
          ],
        };
      },
      async text() {
        return "";
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const reader = new BigQueryBillingReader({
    project: "gethouston",
    table: "gethouston.billing.gcp_billing_export_resource_v1_ABC",
    location: "US",
    fetchToken: async () => "fake-token",
    fetchImpl,
  });

  const result = await reader.query(30);

  // The job ran against the right project, with NAMED params (no value interpolation).
  const firstCall = calls[0];
  if (!firstCall) throw new Error("Expected at least one fetch call");
  expect(firstCall.url).toContain("/projects/gethouston/queries");
  expect(firstCall.body?.parameterMode).toBe("NAMED");
  expect(firstCall.body?.query).toContain("k8s-namespace");
  expect(firstCall.body?.query).toContain("@project_id");
  const names = firstCall.body?.queryParameters.map((p) => p.name).sort();
  expect(names).toEqual(["end_date", "project_id", "start_date"]);

  expect(result.source).toBe("bigquery");
  expect(result.rangeDays).toBe(30);
  expect(result.currency).toBe("USD");
  expect(result.totalUsd).toBeCloseTo(15.75, 4);
  expect(result.byNamespace).toEqual([
    { namespace: "ws-alice", netCostUsd: 12.5 },
    { namespace: "ws-bob", netCostUsd: 3.25 },
  ]);
});

test("BigQueryBillingReader surfaces a query error (never swallows)", async () => {
  const fetchImpl = (async () =>
    ({
      ok: false,
      status: 403,
      async text() {
        return "permission denied";
      },
    }) as unknown as Response) as unknown as typeof fetch;
  const reader = new BigQueryBillingReader({
    project: "p",
    table: "p.d.t",
    location: "US",
    fetchToken: async () => "t",
    fetchImpl,
  });
  await expect(reader.query(7)).rejects.toThrow(/BigQuery query failed: 403/);
});

test("BigQueryBillingReader throws on an incomplete job rather than reporting $0", async () => {
  // jobComplete=false with no rows/errors must NOT become an authoritative $0.
  const fetchImpl = (async () =>
    ({
      ok: true,
      async json() {
        return { jobComplete: false };
      },
      async text() {
        return "";
      },
    }) as unknown as Response) as unknown as typeof fetch;
  const reader = new BigQueryBillingReader({
    project: "p",
    table: "p.d.t",
    location: "US",
    fetchToken: async () => "t",
    fetchImpl,
  });
  await expect(reader.query(30)).rejects.toThrow(/did not complete/);
});

test("BigQueryBillingReader refuses an unsafe table name", () => {
  expect(
    () =>
      new BigQueryBillingReader({
        project: "p",
        table: "p.d.t; DROP",
        location: "US",
      }),
  ).toThrow(/unsafe BigQuery table/);
});
