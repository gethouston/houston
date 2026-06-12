# Houston Cloud — operator dashboard & cost

A single operator view of **what's running per user** and **what it costs**, at
`/<frontend-origin>/admin`. It is internal-only, gated by a Supabase user-id
allowlist, and reads two control-plane endpoints.

## What it shows

- **Cluster summary** — total users, total agents, running pods, live burn rate.
- **Spending** — a live estimate (always) and authoritative billed dollars (when
  BigQuery export is connected), with a 7/30/90-day window.
- **Per user** — each user's namespace, agent count, running count, storage, and
  estimated `$/mo`; expand a row for each agent's state (running / pending /
  asleep / absent), pod detail (phase, node, vCPU/MiB, restarts), and cost.
- **Unattributed resources** — managed pods/PVCs that match no current agent
  (leaked by a failed delete), so you can clean them up.

## The two cost layers (and why)

GCP has **no real-time spend API**. So cost comes in two honest layers:

| | Live estimate | Billed actuals |
|---|---|---|
| Source | Running pod requests × Autopilot rates | BigQuery Cloud Billing **detailed** export |
| Freshness | Instant | Lagged hours to ~5 days (cost allocation: ~3 days, no backfill) |
| Accuracy | Approximate (list price, no CUD/Spot discounts) | Authoritative |
| Setup | None | One-time (below) |

The estimate answers *"what am I burning right now"*; actuals answer *"what was I
actually billed"*. GKE Autopilot bills on **pod resource requests** (not node
size, not usage), and only while a pod is **running** — so a slept agent costs
only its PVC storage. The estimate models exactly that: `Σ(running-pod requests) ×
rates + Σ(PVC size) × disk rate`.

### Rates (override per region)

Defaults are GKE Autopilot **list prices** (published for us-central1; us-east1
has its own SKUs that track within a fraction of a cent). They are env-tunable on
the control plane:

| Env | Default | Meaning |
|---|---|---|
| `CP_RATE_VCPU_HOUR` | `0.0445` | USD per vCPU-hour |
| `CP_RATE_MEM_GIB_HOUR` | `0.0049` | USD per GiB-memory-hour |
| `CP_RATE_PD_GIB_MONTH` | `0.1` | USD per GiB-month (balanced PD backing each PVC) |
| `CP_RATE_CLUSTER_HOUR` | `0.1` | flat cluster-management fee (shown; offset by the GKE free tier) |

Verify against the live SKU pages or `gcloud billing` before trusting the
estimate for anything but a rough run-rate.

## Enabling the dashboard

The pod views and the estimate need only the allowlist:

```sh
# Comma-separated Supabase user ids (the JWT `sub`) allowed to see /admin.
CP_ADMIN_USER_IDS=<your-supabase-user-id>
```

Empty allowlist → `/admin/*` returns 404 (the API never falls open). The reader
needs no extra Kubernetes RBAC: the control plane's ClusterRole already grants
cluster-wide `list` on pods and PVCs.

## Enabling billed actuals (one-time)

Run the script (it gates every IAM/billed step behind `CONFIRM`):

```sh
export PROJECT_ID=gethouston REGION=us-east1 CLUSTER_NAME=houston-cloud
./cloud/scripts/04-billing.sh
```

It enables the BigQuery API, creates the export dataset, turns on **GKE cost
allocation** (the `k8s-namespace` label the query groups by), creates a
control-plane GSA, binds it to the `houston-system/control-plane` KSA via Workload
Identity, and grants it `bigquery.jobUser` + `bigquery.dataViewer`.

Then do the one step gcloud can't: in **Console → Billing → Billing export →
BigQuery export**, enable the **detailed usage cost** export into that dataset
(the *standard* export does not carry the `k8s-namespace` label). Finally set on
the control-plane Deployment and roll it:

```sh
CP_GCP_PROJECT=gethouston
CP_BILLING_BQ_TABLE=gethouston.billing_export.gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX
CP_BILLING_BQ_LOCATION=US
```

Until the export table exists (a few hours), the Spending panel shows the
estimate with a "not configured" note — never a fabricated number. A BigQuery
query failure surfaces visibly as `actualsStatus: "error"` with the real message;
the estimate keeps rendering.

## How attribution works

Every agent pod/PVC is labelled `houston.ai/workspace` + `houston.ai/agent` +
`app.kubernetes.io/managed-by=houston-control-plane`, and lives in the namespace
`ws-<workspace-slug>`. The dashboard joins the control plane's DB (workspaces +
agents) to a live cluster snapshot by the agent label, and joins billed cost by
the cost-allocation `k8s-namespace` label — so estimate and actuals line up per
user. Net cost = `cost + Σ(credits.amount)` (credits are stored negative).
