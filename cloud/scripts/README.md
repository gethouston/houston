# Houston control plane — GCP provisioning scripts

These scripts stand up the Google Cloud infrastructure the **control plane** control plane
runs on: a GKE **Autopilot** cluster with **Agent Sandbox** (gVisor) for isolated
per-org agent sandboxes, plus the supporting APIs (Artifact Registry, Secret
Manager, Cloud Storage).

> [!WARNING]
> **These create real, billed GCP resources.** They are meant to be run **by a
> human** who has access to the target project's **billing account** — not from
> CI and not unattended. Every step that bills or is hard to undo (creating the
> project, linking billing, creating the Autopilot cluster, enabling Agent
> Sandbox) **echoes the exact `gcloud` command** and then **requires you to type
> `CONFIRM`** before it runs. Pass `--yes` to a script to skip the prompts only
> when you fully understand the cost.

## Prerequisites

- `gcloud` CLI, authenticated: `gcloud auth login`
- `kubectl` (for step 03). The GKE auth plugin is pulled in by
  `gcloud components install gke-gcloud-auth-plugin`.
- A GCP **billing account** you are allowed to link. List them with:
  `gcloud billing accounts list`

## Required environment variables

| Variable          | Used by         | Example                     | Notes                                            |
| ----------------- | --------------- | --------------------------- | ------------------------------------------------ |
| `PROJECT_ID`      | 00, 01, 02      | `houston-control-plane-prod`         | Globally unique GCP project id.                  |
| `BILLING_ACCOUNT` | 00              | `01ABCD-23EFGH-45IJKL`      | From `gcloud billing accounts list`.             |
| `REGION`          | 02              | `us-central1`               | Autopilot is **regional**, not zonal.            |
| `CLUSTER_NAME`    | 02              | `houston-control-plane`              | The Autopilot cluster name.                      |

### Optional environment variables

| Variable              | Used by | Default                    | Notes                                                              |
| --------------------- | ------- | -------------------------- | ----------------------------------------------------------------- |
| `PROJECT_NAME`        | 00      | `$PROJECT_ID`              | Human-readable project name.                                       |
| `MIN_CLUSTER_VERSION` | 02      | `1.35.2-gke.1269000`       | Floor for Agent Sandbox support. The script refuses anything older.|
| `CLUSTER_VERSION`     | 02      | latest REGULAR-channel     | Pin an exact version; still floor-checked.                        |
| `VERIFY_NS`           | 03      | `houston-sandbox-verify`   | Disposable namespace for the smoke test (auto-cleaned).           |
| `RUNTIME_CLASS`       | 03      | `gvisor`                   | Must match the control plane `config.runtimeClass`.                        |
| `WAIT_TIMEOUT`        | 03      | `180s`                     | How long to wait for the test Pod to become Ready.                |
| `BQ_DATASET`          | 04      | `billing_export`           | Dataset that receives the Cloud Billing export.                  |
| `BQ_LOCATION`         | 04      | `US`                       | Region of the billing-export dataset.                            |
| `CP_GSA`              | 04      | `houston-control-plane`    | Short name of the control-plane GCP service account.             |
| `CP_NAMESPACE`        | 04      | `houston-system`           | Namespace of the control-plane KSA (Workload Identity binding).  |
| `CP_KSA`              | 04      | `control-plane`            | Name of the control-plane KSA.                                   |

No secrets are passed on the command line or hard-coded in these scripts.

## Run order

Run them in numeric order, from this directory:

```sh
export PROJECT_ID=houston-control-plane-prod
export BILLING_ACCOUNT=01ABCD-23EFGH-45IJKL
export REGION=us-central1
export CLUSTER_NAME=houston-control-plane

./00-project.sh        # create/select project, link billing      (BILLED, gated)
./01-apis.sh           # enable container/artifact/secret/storage  (no charge)
./02-cluster.sh        # create Autopilot cluster + Agent Sandbox  (BILLED, gated)
./03-verify-sandbox.sh # apply a gVisor Pod + deny-all egress, verify it runs
./04-billing.sh        # cost-allocation + BigQuery export + IAM for the dashboard (IAM gated)
./05-code-sandbox.sh   # egress-locked Cloud Run code sandbox                (BILLED, gated)
./06-runtime.sh        # per-turn Cloud Run agent runtime                    (BILLED, gated)
./07-migrate-pvc-to-gcs.sh  # move a gke workspace's PVC files → GCS, flip runtime
./08-custom-domain.sh  # map app.gethouston.ai → houston-web Cloud Run service (gated)
./09-redis.sh          # Memorystore bus for 2+ control-plane replicas       (BILLED, gated)
```

Add `--yes` (or `-y`) to any script to skip the `CONFIRM` prompts.

### What each script does

- **`00-project.sh`** — Creates the project if it does not exist, sets it as the
  active `gcloud` project, and links it to `BILLING_ACCOUNT`. If the project is
  already linked to a **different** billing account it **refuses** to relink and
  exits, so it can never silently move billing.
- **`01-apis.sh`** — Idempotently enables `container`, `artifactregistry`,
  `secretmanager`, and `storage`. Enabling APIs does not bill, so there is no
  prompt; the resources created later are what cost money.
- **`02-cluster.sh`** — Creates a **regional Autopilot** cluster pinned to a
  version `>= MIN_CLUSTER_VERSION` with **Workload Identity**
  (`<project>.svc.id.goog`) and **Agent Sandbox** (gVisor) enabled. Both the
  create and the sandbox enablement are gated. Re-runs are safe: an existing
  cluster is detected and only the sandbox add-on is reconciled. Finishes by
  fetching cluster credentials for `kubectl`.
- **`03-verify-sandbox.sh`** — In a throwaway namespace, applies a
  **default-deny-egress** `NetworkPolicy` and a hello-world Pod with
  `runtimeClassName: gvisor`, waits for it to become Ready, and asserts it
  emitted its marker output. Cleans up the namespace on exit. This is the proof
  that the cluster can run sandboxed, network-isolated agent workloads — exactly
  the shape the control plane schedules.
- **`04-billing.sh`** — Wires the operator dashboard's authoritative cost layer:
  enables the BigQuery API + export dataset, turns on **GKE cost allocation**
  (the `k8s-namespace` label cost is grouped by), and creates a control-plane GSA
  bound to the `houston-system/control-plane` KSA via Workload Identity with
  `bigquery.jobUser` + `dataViewer`. IAM bindings are `CONFIRM`-gated. Prints the
  one Console-only step (enable the **detailed** billing export) and the env vars
  to set. The live estimate needs none of this — only `CP_ADMIN_USER_IDS`. Full
  story in `cloud/billing.md`.

- **`08-custom-domain.sh`** — Maps `app.gethouston.ai` (override with `DOMAIN`)
  to the `houston-web` Cloud Run service: checks domain verification, creates
  the domain mapping, prints the registrar DNS record(s), and lists the two
  manual follow-ups (DNS + Supabase Redirect URLs). Re-runs are safe — an
  existing mapping is detected and only re-described. The SPA stays
  domain-agnostic when built with `VITE_CONTROL_PLANE_URL=/api`.
- **`09-redis.sh`** — Provisions the Memorystore (Redis) instance behind the
  control plane's shared turn-state bus (`CP_REDIS_URL`), which is what allows
  `replicas: 2+` on the control-plane Deployment. Prints the redis-url to add
  to `control-plane-secrets` and the rollout steps. 1 GiB basic tier ≈ $35/mo;
  the create is `CONFIRM`-gated.

### `lib.sh`

Shared helpers (sourced, not executed): `require_env` / `require_cmd` fail fast
on missing config, `run` echoes-then-runs a command and aborts on failure,
`run_billed` adds the `CONFIRM` gate for billed actions, and `parse_common_flags`
handles `--yes`. Errors are always surfaced — nothing is swallowed.

## Safety summary

- Every billed / irreversible step prints the exact command and waits for
  `CONFIRM` (unless `--yes`).
- Every create checks-if-exists first — the scripts are idempotent and safe to
  re-run.
- A failing command aborts the script (`set -euo pipefail` + explicit `die`),
  never log-and-continue.
- No credentials are printed or embedded; all identifiers come from the
  environment.
