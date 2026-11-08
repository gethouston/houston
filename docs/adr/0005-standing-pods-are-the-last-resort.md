# Standing pods are the last resort

In managed cloud, every agent turn and every agent operation runs in one of two places. An E2B sandbox runs it, sent there by the gateway's pool dispatcher: a turn through `Dispatch`, anything else through `DispatchOp` and the runtime's `execute-op`. Or the gateway answers it with a read or a write against the store, meaning pod-store objects and the Postgres agent docs. The per-agent engine pod, a GKE Deployment that runs `packages/host`, is a fallback. It is never the normal path for any operation. New agents are created asleep and stay asleep. A wake is a named exception, not a side effect of proxying.

The host's route handlers stay the one implementation of agent behaviour. A worker runs them against the hydrated agent prefix, so desktop, the worker and a fallback pod run the same code. The gateway answers a request itself only when the answer is a read of a projected doc or a store object, or a write the gateway already owns, such as board cards, credentials and settings rows. It does not rewrite host handlers in Go.

A code path may wake a standing pod only when all three hold:

1. The reason sits beside the call as a `WakeReason` constant from the one enum in cloud `internal/cpclient/wakereason.go`. The constant's comment says why no op or store path can serve it.
2. The wake is counted. The control plane counts every request in `houston_cp_ensure_awake_total{reason,result}` and logs the reason with the org and agent. A `scaled` result is a real wake from zero replicas. A call site that wakes without a reason fails `TestEveryWakeCarriesAReason`, and every test fake of the control plane refuses such a wake. For a served org, every scale is also counted in `houston_cp_pool_served_scaled_total{reason,outage}`. `outage="true"` is the E2B-outage fallback below. Every other scale except an `operator` wake is a pool gap, and the control plane logs it at warn.
3. The reason is on the allowlist below. Adding one amends this ADR and gets the review a migration gets.

A pod that woke for an allowed reason should sleep as soon as its busy probe is clear, not after the idle window. While it is awake, the gateway sends most of that agent's requests to it instead of answering them from the store. Today the control plane does this only for a pod that kept a turn because its drain would have been slow. Every other woken pod still waits out the idle window, so this rule is still to build.

## Allowed reasons

This list is the state on 2026-10-02. An org outside the serve scope, `GW_POOL_SERVE_ORGS`, has no pool path yet, so any reason may wake its pods until it joins. That is all of production today. In a served org only these reasons may wake a pod:

| Reason | Why it still needs a pod | Leaves the list when |
|---|---|---|
| `assistant` | Houston's own agent. Its chat turns move to E2B with cloud #459, on top of houston #1670 and #1674, which are merged. Its routine and trigger fires, its channel messages, the ops on its own agent, and its first provision and seed still run on its pod. | All of those run in E2B or against the store. |
| `provider_login` | A sign-in in progress keeps its state in runtime memory: the CLI child process, the paste resolver, the timers. | A login sandbox or the store holds that state. |
| `setup_runtime` | The hidden setup pod connects a provider before the org's first agent exists. It holds the same login state. | The login state moves as for `provider_login`, and the gateway answers the setup reads and credential routes. |
| `custom_oauth` | The PKCE verifier and the pending attempt live in host memory for 10 minutes, and the browser callback has to reach that process. | The store holds the sealed attempt, and start and callback run as ops. |
| `sleep_undo` | Fresh activity raced our own sleep, so the pod comes back for work already sent to it. | Stays. |
| `operator` | A person calling the control API by hand. | Stays. |

Every other reason in the enum is a fallback to remove. Since 2026-10-04 a served org's pod wakes only when something names the wake, through the same serve scope and no new flag:

- The gateway's one allowlist of routes, cloud `internal/edge/agents/podrequired.go`, names each route that still needs the pod and its reason. A request off it that no store or pool path answered gets `503 {"error":"engine unavailable","code":"pod_wake_refused"}`. A pool path hands a request to the pod on purpose only for E2B down, a turn or path the worker cannot carry, a declined op, a store not migrated yet, a routine only the pod's file knows, or a wake that already owns the agent.
- E2B down is not a reason of its own. The outage's wake keeps its route's reason (`send`, `run_now`, `op`, `read`, `agent_unseeded`), and that reason authorizes the wake. The gateway also sends `X-Houston-Wake-Outage: 1`, and the control plane reads it only to count the scale as `outage="true"`. A control plane that predates the header still wakes for the outage, which is what keeps the fallback working through a rollback.
- A mission start resolves its provider and model pin in the gateway, the way the host's `missions-provider.ts` does. It reads the host's tables from the `pin` facts that `GET /v1/catalog` carries for each provider, and it asks the credential serve whether the provider is connected. A pin the host would refuse gets the host's `400 invalid_provider` sentence. There is no `mission_pin` fallback any more. Two named fallbacks are left. `catalog_predates_pins` covers a served catalog from before the `pin` facts, and it ends on the next engine roll. `shared_local_endpoint` covers an `openai-compatible` pin for a scope with no credential row of its own, such as an org-shared endpoint, which only the pod reaches.
- Short of sandbox room, or after a sandbox failed before running a turn and a retry on a fresh one failed too, a send, Run now or op answers `503 compute_busy` (wire type `ComputeRefusal` in `@houston/wire-types`). Nothing ran. The SDK sends the same request again: a turn keeps thinking for up to 10 minutes and its VM says `sendWaiting: "busy"` after 15 s; an SDK REST write re-sends within 20 s.
- The control plane refuses a served org's wake that names no reason or one that never applies there (`agent_create`, `agent_rename`).

The rows below shrink as their routes leave `podrequired.go`.

| Reason | What it is | What replaces it |
|---|---|---|
| `send`, `run_now`, `op` | A pool fallback: E2B down, a body or path the worker cannot carry, an op the worker declined. No sandbox room waits instead (`compute_busy`). | Each fallback becomes a pool path or a typed refusal. |
| `read` | A read the store did not answer. No doc yet, file authority, or a stream the turn log could not serve. | Reads of the store file and views the gateway builds. |
| `conversation_control`, `routine_run_cancel` | Mode, dismiss, truncate, import and cancel on a conversation, and stopping a routine run. | Conversation ops, and a cancel through the pool claims. |
| `mission`, `mission_stream`, `first_day` | Delegation, following a mission's stream, and a new agent's setup turn. A mission start no longer wakes for its pin (see above). It wakes only for `catalog_predates_pins` or `shared_local_endpoint`. | An op that hands back the turn to dispatch, mission streams read from the turn log, and a pool path to org-shared local endpoints. |
| `pod_route` | Any other route only the pod serves. | An op, or a 404 before any wake for a route the pod does not serve. |
| `agent_unseeded` | The worker could not seed a new agent, so the gateway seeds it through its pod. | The seed op retries in the background. |
| `agent_create`, `agent_rename` | An org outside the serve scope. Agents in a served org are born asleep since cloud #460 and rename without a pod since cloud #458. A create there names `agent_create` only when something already woke the new agent's pod, so its seed scales nothing. | The org joins the serve scope. |
| `routine_fire`, `trigger_fire` | A fire the pool stood down. Houston's own fires count here too. | Pool fires that retry or fail with a typed reason. |
| `routine_alarm` | The waker's pre-wake for an org whose fires do not run on the pool. | Putting the org in the routine serve scope. |

## Considered Options

- **Faster wakes and warm pods per org.** This keeps two execution paths forever and pays for pods by agent count, not by activity. Rejected.
- **One long-lived sandbox per agent.** Rejected on 2026-09-28. It only improves the cold wake, costs about the same as per-turn sandboxes, and brings back per-agent state and sleep bookkeeping.
- **Port host handlers to Go.** Two implementations drift apart, and desktop still needs the TypeScript ones. Rejected, except for pure doc and object reads.

## Consequences

- State that lives only in pod memory moves out before its reason leaves the allowlist. Pending OAuth attempts and provider logins go to the store or to a short-lived login sandbox. Assistant approvals and grants go to the store.
- Work the pod did on boot or on a timer moves. Per-turn work runs inside the turn: autocompact, titles, routine bookkeeping, doc publication. Pod-store runs the projections on every write. Control-plane jobs that dispatch ops run the migrations and repairs: legacy layouts, routine authors, stale runs, lagging docs.
- An awake pod still owns its prefix, so there is never a second writer. An idle awake pod drains to the store and yields the next turn to E2B. A busy one keeps the turn and records why. That is why the fallback must be rare and short.
- Every stateless writer migrates a legacy layout on write for the family it touches, because the batch migration never overwrites a destination that exists.
- The gateway route inventory gains the engine that serves each agent route: `pool-op`, `gateway-store` or `standing`. A `standing` route with no allowed reason fails the check.
- "Pods off" means every Deployment at zero replicas. The registry stays in Kubernetes until a separate decision moves it to Postgres.
- Desktop does not change. It has one host on one machine and no fallback question.
