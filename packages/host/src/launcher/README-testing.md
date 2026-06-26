# Testing `GkeLauncher` against a real Kubernetes cluster

`GkeLauncher` is the one cloud adapter that **cannot** be exercised in-process: it
drives a real apiserver (a Namespace + PVC + Service + Deployment per agent,
scale-to-zero on `sleep`, delete on `destroy`). There is no faithful in-memory
Kubernetes, so `launcher/contract.test.ts` keeps a `test.todo` for it and the real
coverage lives in `launcher/gke.integration.test.ts`, **gated on
`HOUSTON_GKE_TEST=1`**. With the gate unset the file self-skips with a one-line
reason — it is never asserted trivially-true.

It runs against your **ambient kube context** (`kc.loadFromDefault()`), so point
`kubectl` at a throwaway cluster (a local `kind`/minikube, or a scratch GKE
namespace) before running.

## Quick run on a local `kind` cluster

Needs Docker + `kind` + `kubectl`. (`docker info` to confirm Docker is present —
it is NOT in every dev sandbox.)

```sh
# 1. Stand up a throwaway cluster.
kind create cluster --name houston-gke-test

# 2. Build + load a tiny always-ready stub the agent Deployment can run. The
#    launcher waits for GET /health → 200 on port 4317, so any image that serves
#    that works. Example using a 10-line Bun health server baked into an image,
#    or reuse the real agent image if you have it locally:
#
#    Minimal stub (save as Dockerfile.stub):
#      FROM oven/bun:1-alpine
#      RUN printf 'Bun.serve({port:4317,fetch:()=>new Response("ok")});' > /s.js
#      USER 1000
#      CMD ["bun","/s.js"]
docker build -f Dockerfile.stub -t houston-agent-stub:test .
kind load docker-image houston-agent-stub:test --name houston-gke-test

# 3. Run the integration suite against the cluster.
cd packages/host
HOUSTON_GKE_TEST=1 \
CP_AGENT_IMAGE=houston-agent-stub:test \
CP_NAMESPACE_PREFIX=ws- \
  bun test src/launcher/gke.integration.test.ts

# 4. Tear down.
kind delete cluster --name houston-gke-test
```

Notes:
- `CP_AGENT_IMAGE` MUST resolve on the cluster and serve `GET /health → 200` on
  port 4317, or `ensureAwake`'s readiness wait times out (the contract block).
  The reconcile/idempotency block does NOT wait for readiness and passes with any
  image that schedules.
- `CP_RUNTIME_CLASS` is left empty by default (a `kind` cluster has no gVisor/Kata
  RuntimeClass; an empty value omits `runtimeClassName` so the pod schedules).
- On GKE Autopilot the pod's restricted PodSecurity is already satisfied by the
  manifest (`runAsNonRoot`, dropped caps, `seccompProfile: RuntimeDefault`).

## What it proves

1. The SAME `runRuntimeLauncherContract` `FakeLauncher`/`ProcessLauncher` pass —
   `ensureAwake` returns a reachable endpoint + marks the agent running, re-wake
   is idempotent (warm Deployment reused), `sleep` then `ensureAwake` re-wakes,
   independent agents track state separately — now against a real apiserver.
2. An apiserver-object reconcile/idempotency suite (no pod-readiness dependency):
   every `ensure*` step creates its object and is a no-op on re-run (the
   404→create / 409→already-exists control flow in `reconcile.ts`), `status` is
   `absent` for an unknown agent, `asleep` after scale-to-zero, and `absent`
   after `destroy`.

## CI

Wire this into a cluster-bearing CI job (a `kind`-in-CI step or a scratch GKE
namespace) that exports `HOUSTON_GKE_TEST=1` + `CP_AGENT_IMAGE`. On the default
unit-test runner (no cluster) the file self-skips, so it is safe to keep in the
normal `bun test` glob.
