import type { ProviderUsage } from "@houston/runtime-client";
import { json, parseBody } from "./http";
import type { FakeCapabilities, TeamsSettings } from "./state";
import * as state from "./state";

export async function handleStateControls(
  req: Request,
): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  const method = req.method;
  if (path === "/__test__/hold-agent-reads" && method === "POST") {
    const body = await parseBody(req);
    state.setAgentReadHoldMs(Number(body?.ms ?? 0));
    return json({ ms: state.arming.agentReadHoldMs });
  }
  if (path === "/__test__/hold-imports" && method === "POST") {
    const body = await parseBody(req);
    state.setImportHold(body?.hold === true);
    return json({ hold: state.arming.importHold !== null });
  }
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
  if (path === "/__test__/workspace-read-only" && method === "POST") {
    const body = await parseBody(req);
    state.setReadOnlyWorkspaces(
      Array.isArray(body?.agentIds) ? body.agentIds.map(String) : [],
    );
    return json({ agentIds: [...state.arming.readOnlyWorkspaces] });
  }
  if (path === "/__test__/routine-seq" && method === "POST") {
    const body = await parseBody(req);
    state.setRoutineSeq(Number(body?.next ?? 0));
    return json({ next: state.state.routineSeq });
  }
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
  if (path === "/__test__/custom-integrations" && method === "POST") {
    const body = await parseBody(req);
    state.setCustomIntegrations(
      Array.isArray(body?.items)
        ? (body.items as state.CustomIntegrationSeed[])
        : null,
    );
    return json({ items: state.listCustomIntegrations() });
  }
  if (path === "/__test__/capabilities" && method === "POST") {
    const body = await parseBody(req);
    return json(
      state.setCapabilities((body ?? {}) as Partial<FakeCapabilities>),
    );
  }
  if (path === "/__test__/compute-usage" && method === "POST") {
    const body = await parseBody(req);
    return json({
      seed: state.setComputeUsage(
        (body?.seed ?? null) as state.ComputeUsageSeed | null,
      ),
    });
  }
  if (path === "/__test__/provider-usage" && method === "POST") {
    const body = await parseBody(req);
    return json({
      rows: state.setProviderUsage(
        (body?.rows ?? null) as ProviderUsage[] | null,
      ),
    });
  }
  if (path === "/__test__/agent-settings" && method === "POST") {
    const body = await parseBody(req);
    return json(state.setTeamsSettings((body ?? {}) as Partial<TeamsSettings>));
  }
  return undefined;
}
