import type { ProviderUsage } from "@houston/runtime-client";
import { json, parseBody } from "./http";
import type { FakeCapabilities, TeamsSettings } from "./state";
import * as state from "./state";

export async function handleStateControls(
  req: Request,
): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  const method = req.method;
  // Stall every per-agent read (`GET /agents/:id/*`) by `ms` — the cloud
  // gateway's `ensureAwake` hold: an asleep pod's reads hang until it wakes.
  // `{ ms: 0 }` (and the per-test reset) answers instantly again.
  if (path === "/__test__/hold-agent-reads" && method === "POST") {
    const body = await parseBody(req);
    state.setAgentReadHoldMs(Number(body?.ms ?? 0));
    return json({ ms: state.arming.agentReadHoldMs });
  }
  // Hold every conversation import until `{ hold: false }` (or the per-test
  // reset) lets them through: keeps onboarding on its closing across a reload.
  if (path === "/__test__/hold-imports" && method === "POST") {
    const body = await parseBody(req);
    state.setImportHold(body?.hold === true);
    return json({ hold: state.arming.importHold !== null });
  }
  // Fail every per-agent read (`GET /agents/:id/*`) for the named agents with a
  // 500, leaving the rest healthy — the half-broken fleet the cross-agent
  // sweep must survive (HOU-981). `{ segments: ["routine_runs"] }` narrows it
  // to named sub-resources, the subtler state where one route is down while the
  // rest of that same agent answers. `{ agentIds: [] }` (and the per-test
  // reset) restores them.
  if (path === "/__test__/fail-agent-reads" && method === "POST") {
    const body = await parseBody(req);
    state.setFailingAgentReads(
      Array.isArray(body?.agentIds) ? body.agentIds.map(String) : [],
      Array.isArray(body?.segments) ? body.segments.map(String) : null,
    );
    return json({
      agentIds: [...state.arming.failingAgentReads],
      segments: state.arming.failingAgentReadSegments
        ? [...state.arming.failingAgentReadSegments]
        : null,
    });
  }
  // Make the named agents' workspaces refuse every files WRITE with the host's
  // `403 read_only` — a read-only mount or revoked folder permissions, which
  // the Files tab explains in authored copy instead of failing silently. Reads
  // keep answering. `{ agentIds: [] }` (and the per-test reset) restores them.
  if (path === "/__test__/workspace-read-only" && method === "POST") {
    const body = await parseBody(req);
    state.setReadOnlyWorkspaces(
      Array.isArray(body?.agentIds) ? body.agentIds.map(String) : [],
    );
    return json({ agentIds: [...state.arming.readOnlyWorkspaces] });
  }
  // Rewind the routine-id counter so the NEXT created routine reuses an id an
  // earlier agent already has (`{ next: 0 }` = start over at `routine-1`).
  // Routine ids are unique per AGENT in the real host, so two agents holding
  // `routine-1` is ordinary truth; the fake's single global counter is the only
  // reason a spec would never see it.
  if (path === "/__test__/routine-seq" && method === "POST") {
    const body = await parseBody(req);
    state.setRoutineSeq(Number(body?.next ?? 0));
    return json({ next: state.state.routineSeq });
  }
  // Toggle Composio readiness: "ready" | "unavailable" (503) | "signin" |
  // "absent" (not registered at all — only the custom provider, when armed).
  if (path === "/__test__/integrations-mode" && method === "POST") {
    const body = await parseBody(req);
    state.setIntegrationsMode(
      body?.mode === "unavailable" ||
        body?.mode === "signin" ||
        body?.mode === "absent"
        ? body.mode
        : "ready",
    );
    return json({ mode: state.integrationsMode() });
  }
  // Arm the custom-integrations feature (HOU-550): `{items: [...]}` serves the
  // definitions + a ready `custom` provider; `{items: null}` disarms (404s —
  // the pre-feature host shape). Reset restores disarmed.
  if (path === "/__test__/custom-integrations" && method === "POST") {
    const body = await parseBody(req);
    state.setCustomIntegrations(
      Array.isArray(body?.items)
        ? (body.items as state.CustomIntegrationSeed[])
        : null,
    );
    return json({ items: state.listCustomIntegrations() });
  }
  // Override advertised capabilities (Teams e2e): merge a partial into the set,
  // e.g. `{ integrations:["composio"], multiplayer:true, teams:true, role:"owner" }`
  // to reach the Teams-shaped state single-player can't. Reset restores the seed.
  if (path === "/__test__/capabilities" && method === "POST") {
    const body = await parseBody(req);
    return json(
      state.setCapabilities((body ?? {}) as Partial<FakeCapabilities>),
    );
  }
  // Arm the compute-usage dataset `GET /v1/org/compute-usage` serves (pair with
  // `/__test__/capabilities` `{computeUsage:true}`); `{seed:null}` disarms.
  if (path === "/__test__/compute-usage" && method === "POST") {
    const body = await parseBody(req);
    return json({
      seed: state.setComputeUsage(
        (body?.seed ?? null) as state.ComputeUsageSeed | null,
      ),
    });
  }
  // Arm the rows `GET /providers/usage` serves — the live per-account usage the
  // AI Models hub's Connected rows render (windows, credits, non-ok states).
  // `{rows:null}` restores the default seed (the Claude subscription).
  if (path === "/__test__/provider-usage" && method === "POST") {
    const body = await parseBody(req);
    return json({
      rows: state.setProviderUsage(
        (body?.rows ?? null) as ProviderUsage[] | null,
      ),
    });
  }
  // Arm the Teams settings the gateway serves at the settings routes below:
  // the agent + org integration ceilings, the model ceiling, and agent access.
  if (path === "/__test__/agent-settings" && method === "POST") {
    const body = await parseBody(req);
    return json(state.setTeamsSettings((body ?? {}) as Partial<TeamsSettings>));
  }
  return undefined;
}
