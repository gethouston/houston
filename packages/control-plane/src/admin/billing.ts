import type { PodInfo, VolumeInfo } from "./cluster";
import { bytesToGiB } from "./quantity";

/**
 * Cost math for the operator dashboard. Two layers, deliberately distinct:
 *
 *   1. ESTIMATE — instant, from live cluster state. GKE Autopilot bills on Pod
 *      resource *requests*, so a running pod's burn = Σrequests × list rates, and
 *      a PVC's standing cost = its size × the PD rate. Approximate (list price, no
 *      committed-use/Spot discounts) and clearly labelled as such in the UI.
 *
 *   2. ACTUALS — authoritative, lagged. The real billed dollars come from the
 *      BigQuery Cloud Billing *detailed* export grouped by the GKE cost-allocation
 *      `k8s-namespace` label. Optional: only when configured (see BillingActuals).
 */

/** USD rates the estimate multiplies against (from config). */
export interface AutopilotRates {
  vcpuHourUsd: number;
  memGiBHourUsd: number;
  pdGiBMonthUsd: number;
  clusterHourUsd: number;
}

/** Autopilot bills per-second; we project an hourly rate to a month with this. */
export const HOURS_PER_MONTH = 730;

/** A money pair so the UI can show both "burning now" and "if it ran all month". */
export interface CostRate {
  perHourUsd: number;
  perMonthUsd: number;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Hourly compute cost of one running pod from its CPU + memory requests. */
export function podHourlyUsd(pod: PodInfo, rates: AutopilotRates): number {
  return (
    pod.cpuRequestCores * rates.vcpuHourUsd +
    bytesToGiB(pod.memRequestBytes) * rates.memGiBHourUsd
  );
}

/** Monthly storage cost of one PVC from its requested size. */
export function volumeMonthlyUsd(
  vol: VolumeInfo,
  rates: AutopilotRates,
): number {
  return bytesToGiB(vol.storageRequestBytes) * rates.pdGiBMonthUsd;
}

/**
 * Roll a set of pods + volumes into one estimate. Compute is charged only while a
 * pod is *running* (Autopilot bills creating/running pods, not slept ones, where
 * the Deployment is scaled to zero and no pod exists); storage is charged as long
 * as the PVC exists, asleep or not. So perMonth = running-compute-for-a-month +
 * standing-storage.
 */
export function estimate(
  pods: PodInfo[],
  volumes: VolumeInfo[],
  rates: AutopilotRates,
): CostRate {
  const computeHourly = pods
    .filter((p) => p.phase === "Running")
    .reduce((acc, p) => acc + podHourlyUsd(p, rates), 0);
  const storageMonthly = volumes.reduce(
    (acc, v) => acc + volumeMonthlyUsd(v, rates),
    0,
  );
  return {
    perHourUsd: round4(computeHourly),
    perMonthUsd: round4(computeHourly * HOURS_PER_MONTH + storageMonthly),
  };
}

/** Net (after-credit) billed cost for one Kubernetes namespace. */
export interface NamespaceCost {
  namespace: string;
  netCostUsd: number;
}

/** A window of authoritative billed cost, broken down by namespace. */
export interface BillingActuals {
  source: "bigquery";
  rangeDays: number;
  startDate: string; // YYYY-MM-DD (UTC)
  endDate: string;
  currency: string;
  totalUsd: number;
  byNamespace: NamespaceCost[];
}

/** Reads authoritative billed cost. Impls: BigQueryBillingReader, FakeBillingReader. */
export interface BillingActualsReader {
  /** Net cost per namespace over the last `days`. Throws (never swallows) on failure. */
  query(days: number): Promise<BillingActuals>;
}

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const BQ_QUERY_URL = (project: string) =>
  `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`;

/** UTC YYYY-MM-DD for `daysAgo` days before now (0 = today). */
function utcDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export interface BigQueryConfig {
  /** GCP project the query job runs in AND whose costs are filtered (project.id). */
  project: string;
  /** Fully-qualified detailed-export table: `project.dataset.gcp_billing_export_resource_v1_XXXX`. */
  table: string;
  /** Dataset region (the query job must run where the data lives). */
  location: string;
  /** Override the access-token fetch (tests). Default: the GCP metadata server. */
  fetchToken?: () => Promise<string>;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

/** Only a trusted operator env value reaches the table name; still, fail closed on anything odd. */
function assertSafeTable(table: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(table)) {
    throw new Error(
      `refusing to query unsafe BigQuery table name: ${JSON.stringify(table)}`,
    );
  }
}

/**
 * Authoritative cost via the BigQuery REST `jobs.query` endpoint. No SDK: a token
 * comes from the GCP metadata server (Workload Identity on GKE), and the query is
 * the documented net-cost-per-namespace pattern (cost + Σcredits, credits stored
 * negative) over the GKE cost-allocation `k8s-namespace` label.
 */
export class BigQueryBillingReader implements BillingActualsReader {
  private readonly fetchToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: BigQueryConfig) {
    if (!cfg.project)
      throw new Error("BigQueryBillingReader requires a GCP project");
    assertSafeTable(cfg.table);
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.fetchToken = cfg.fetchToken ?? (() => this.metadataToken());
  }

  private async metadataToken(): Promise<string> {
    const res = await this.fetchImpl(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
    });
    if (!res.ok) {
      throw new Error(
        `metadata token fetch failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token)
      throw new Error("metadata token response had no access_token");
    return body.access_token;
  }

  private sql(): string {
    // Net cost = cost + Σ(credits.amount); credits are negative. Integer-micros
    // avoids float drift. ns = the GKE cost-allocation namespace label value.
    return `
      SELECT
        ns.value AS namespace,
        (
          SUM(CAST(cost * 1000000 AS INT64))
          + SUM(IFNULL((SELECT SUM(CAST(c.amount * 1000000 AS INT64)) FROM UNNEST(credits) c), 0))
        ) / 1000000 AS net_cost,
        ANY_VALUE(currency) AS currency
      FROM \`${this.cfg.table}\`
      LEFT JOIN UNNEST(labels) AS ns ON ns.key = 'k8s-namespace'
      WHERE _PARTITIONTIME >= TIMESTAMP(DATE_SUB(@start_date, INTERVAL 2 DAY))
        AND DATE(usage_start_time, 'UTC') >= @start_date
        AND DATE(usage_start_time, 'UTC') <= @end_date
        AND project.id = @project_id
        AND ns.value IS NOT NULL
      GROUP BY namespace
      ORDER BY net_cost DESC`;
  }

  async query(days: number): Promise<BillingActuals> {
    const startDate = utcDate(days);
    const endDate = utcDate(0);
    const token = await this.fetchToken();
    const res = await this.fetchImpl(BQ_QUERY_URL(this.cfg.project), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: this.sql(),
        useLegacySql: false,
        location: this.cfg.location,
        timeoutMs: 30_000,
        parameterMode: "NAMED",
        queryParameters: [
          param("start_date", "DATE", startDate),
          param("end_date", "DATE", endDate),
          param("project_id", "STRING", this.cfg.project),
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(
        `BigQuery query failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
    const data = (await res.json()) as BqQueryResponse;
    if (data.errors?.length) {
      throw new Error(
        `BigQuery job error: ${data.errors.map((e) => e.message).join("; ")}`,
      );
    }
    // jobs.query returns jobComplete=false (no rows, no errors) when the query is
    // still running past timeoutMs. Surfacing that as $0 billed would be a confident
    // wrong number — throw so it reaches the operator as actualsStatus="error".
    if (data.jobComplete === false) {
      throw new Error(
        "BigQuery query did not complete within timeout (jobComplete=false). Retry, raise timeoutMs, or poll the job asynchronously.",
      );
    }
    return this.parse(data, days, startDate, endDate);
  }

  private parse(
    data: BqQueryResponse,
    days: number,
    startDate: string,
    endDate: string,
  ): BillingActuals {
    const byNamespace: NamespaceCost[] = (data.rows ?? []).map((row) => {
      const cells = row.f ?? [];
      return {
        namespace: cells[0]?.v ?? "",
        netCostUsd: Number(cells[1]?.v ?? 0),
      };
    });
    const currency = (data.rows ?? [])[0]?.f?.[2]?.v ?? "USD";
    const totalUsd = byNamespace.reduce((acc, n) => acc + n.netCostUsd, 0);
    return {
      source: "bigquery",
      rangeDays: days,
      startDate,
      endDate,
      currency,
      totalUsd: round4(totalUsd),
      byNamespace: byNamespace.map((n) => ({
        ...n,
        netCostUsd: round4(n.netCostUsd),
      })),
    };
  }
}

interface BqCell {
  v?: string;
}
interface BqRow {
  f?: BqCell[];
}
interface BqQueryResponse {
  rows?: BqRow[];
  errors?: { message: string }[];
  /** False when the synchronous wait elapsed before the job finished (no rows yet). */
  jobComplete?: boolean;
}

function param(name: string, type: string, value: string) {
  return { name, parameterType: { type }, parameterValue: { value } };
}

/** In-memory actuals for dev/tests — returns a fixed result. */
export class FakeBillingReader implements BillingActualsReader {
  constructor(private readonly result: BillingActuals) {}
  async query(): Promise<BillingActuals> {
    return this.result;
  }
}
