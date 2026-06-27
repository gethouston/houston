# `cloud/k8s/` — GKE Agent-Sandbox manifests

Kubernetes manifest **templates** for running one isolated pi runtime sandbox per
agent on GKE Agent Sandbox. They are the concrete realization of the security
model in [`cloud/README.md`](../README.md): **one agent = one sandbox = one
volume + default-deny networking**.

These files are **not** directly `kubectl apply`-able. They carry `{{...}}`
placeholders that the **control plane's `SandboxManager`** (the `GkeSandboxManager`
impl of the `SandboxManager` port) substitutes per workspace/agent at spawn time,
then applies via the GKE API.

## How they map to the plan

| File | Plan section | Role |
|---|---|---|
| `namespace.yaml` | §6 (tenancy), §8 (Workload Identity) | Per-workspace namespace `<namespacePrefix><workspace-slug>`. The unit network policy + quotas scope to. Enforces the `restricted` Pod Security profile. |
| `agent-deployment.yaml` | §1, §3 (one runtime = one sandbox), §5 (keyless), §8 (gVisor) | Per-agent `Deployment` (1 replica) + `Service`. Runs the pi runtime under `runtimeClassName: gvisor`, mounts the agent's PVC at `/data`, wires the keyless proxy env, non-root hardened, `/health` probes. |
| `pvc.yaml` | §2.1, §6 (one agent = one volume), §7 (sleep keeps the disk) | Per-agent `ReadWriteOnce` PVC. SalesAgent's disk; HR's files do not exist in it. |
| `networkpolicy.yaml` | §2.3, §8 (default-deny + metadata block) | The third wall: default-deny ingress+egress, allow only DNS, outbound 443 to the public internet (minus internal + metadata), and the control plane. |
| `serviceaccount.yaml` | §3 (stable identity), §8 (Workload Identity) | Per-agent KSA bound to a least-privilege GCP SA. |
| `kustomization.yaml` | — | Bundles the set for linting + documents apply order. |

## How the `SandboxManager` templates them

The `SandboxManager` port (`packages/host/src/ports.ts`) drives the lifecycle.
Each method maps to operations on these manifests:

- **`ensureAwake(agent)`** — ensure the workspace namespace + agent objects exist
  and the Deployment is scaled to 1, then return a `SandboxEndpoint`.
  1. First agent in a workspace: render + apply `namespace.yaml` and
     `networkpolicy.yaml` (workspace-scoped).
  2. Render + apply `serviceaccount.yaml`, `pvc.yaml`, `agent-deployment.yaml`
     (agent-scoped). If they already exist, scale the Deployment `replicas` 0 → 1.
  3. Create the two Secrets the Deployment references (see below).
  4. Wait for the pod to pass its `readinessProbe` (the `/health` endpoint), then
     return `{ baseUrl: "http://agent-<id>.<workspace-ns>.svc.cluster.local:4317",
     token: <runtime-token> }`.
- **`sleep(agentId)`** — scale the Deployment `replicas` to 0. The PVC is kept, so
  the workspace survives (§7, scale-to-zero).
- **`destroy(agentId, { dropVolume })`** — delete the Deployment, Service,
  ServiceAccount, and Secrets. Delete the PVC **only** if `dropVolume` is set
  (default keeps the volume, per the port doc).
- **`status(agentId)`** — `running` if the Deployment has a ready replica,
  `asleep` if it exists at 0 replicas, `absent` if no Deployment.

### Placeholders the `SandboxManager` fills

Workspace-scoped:

| Placeholder | Source |
|---|---|
| `{{WORKSPACE_NS}}` | `config.namespacePrefix + workspace.slug` |
| `{{WORKSPACE_ID}}` / `{{WORKSPACE_SLUG}}` | the `Workspace` record |
| `{{CP_NS}}` | the namespace the control plane runs in (deploy-time constant) |
| `{{POD_CIDR}}` / `{{SERVICE_CIDR}}` | the cluster's Pod/Service CIDRs (cluster facts) |

Agent-scoped:

| Placeholder | Source |
|---|---|
| `{{AGENT_ID}}` / `{{AGENT_NAME}}` | the `Agent` record |
| `{{IMAGE}}` | `config.agentImage` |
| `{{RUNTIME_CLASS}}` | `config.runtimeClass` (`gvisor` v1) |
| `{{PROXY_BASE_URL}}` | the control plane keyless-proxy base URL (deploy-time constant) |
| `{{GCP_SA}}` | the per-agent GCP service account email |
| `{{VOLUME_SIZE}}` / `{{STORAGE_CLASS}}` | sizing policy + GKE storage class |
| `{{CPU_REQUEST}}` `{{CPU_LIMIT}}` `{{MEM_REQUEST}}` `{{MEM_LIMIT}}` | sizing policy |

## Secrets — created at apply time, never templated here

The Deployment reads two `Secret`s that are **deliberately absent** from this
directory because they carry per-agent values and must not be committed. The
`SandboxManager` creates them imperatively in the workspace namespace before
scaling the Deployment up:

| Secret name | Key | Value | Source |
|---|---|---|---|
| `agent-<id>-sandbox-token` | `token` | the **non-secret** control-plane-issued sandbox token | `CredentialVault.sandboxToken(workspaceId, agentId)` |
| `agent-<id>-engine-token` | `token` | the bearer the runtime requires inbound; becomes `SandboxEndpoint.token` | minted by the control plane per agent |

The sandbox token is what the agent's pi-ai sends to the keyless proxy (§5); the
proxy validates it (`CredentialVault.validateSandboxToken`) and swaps in the real
provider key on the way upstream. **No real provider key ever enters the
sandbox** — confirmed by the spike at `packages/runtime/spike/keyless-proxy.ts`.

## Keyless-proxy env wiring (the §5 seam)

`agent-deployment.yaml` sets, on the runtime container:

- `HOUSTON_CLOUD=1` — flips the runtime into cloud/keyless mode.
- `HOUSTON_PROXY_BASE_URL={{PROXY_BASE_URL}}` — what pi-ai's `model.baseUrl`
  points at instead of the provider.
- `HOUSTON_SANDBOX_TOKEN` — from the `agent-<id>-sandbox-token` Secret; the
  credential the sandbox carries to the proxy.

It also sets the runtime-server vars (`HOUSTON_HOST=0.0.0.0`, `HOUSTON_PORT=4317`,
`HOUSTON_RUNTIME_TOKEN` from Secret, `HOUSTON_WORKSPACE_DIR=/data`,
`HOUSTON_DATA_DIR=/data/.houston`).

> The cloud-mode env names (`HOUSTON_CLOUD`, `HOUSTON_PROXY_BASE_URL`,
> `HOUSTON_SANDBOX_TOKEN`) are the contract this manifest expects the runtime to
> read. The runtime cloud-mode work (control plane task #7) must consume exactly
> these. The runtime-server vars
> (`HOUSTON_HOST/PORT/RUNTIME_TOKEN/WORKSPACE_DIR/DATA_DIR`) already exist in
> `packages/runtime/src/config.ts`.

## What must be filled / true at apply time

1. **All `{{...}}` placeholders** substituted (tables above). A leftover `{{` is a
   bug — the validator script (`scripts/validate.sh`) rejects any.
2. **gVisor RuntimeClass** named `{{RUNTIME_CLASS}}` exists on the cluster
   (Agent Sandbox provides it). Plan §8.
3. **A NetworkPolicy-enforcing CNI** is active (GKE Autopilot ships one). Without
   it `networkpolicy.yaml` is silently inert — verify during P7.
4. **Workload Identity** enabled on the cluster + node pool; the `{{GCP_SA}}` GSA
   exists and has the IAM binding to the KSA.
5. **The two Secrets** created in the namespace before the Deployment scales up.
6. **The control plane namespace** carries the label
   `houston.ai/component: control-plane` so the NetworkPolicy's
   `namespaceSelector` matches it for ingress + control plane egress.

## Validating locally

You cannot `apply` here (no cluster), but you can lint:

```sh
cloud/k8s/scripts/validate.sh
```

It checks: every `*.yaml` parses as YAML, that the agent-scoped templates render
(placeholders -> dummy values) into valid YAML, and that no `{{` survives a
render, so a malformed template is caught before it reaches a cluster. It uses
Node/tsx plus the `yaml` package from the pnpm workspace, so it needs no cluster
and no `kustomize`/`kubectl` install.
