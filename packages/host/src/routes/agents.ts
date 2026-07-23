import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutineRuns, seedSchemas } from "@houston/domain";
import {
  type CustomEndpoint,
  type HoustonEvent,
  parseClaudeOAuthEnvelope,
} from "@houston/protocol";
import {
  ACTING_AS_HEADER,
  actingAuthorFromHeader,
  actingSubFromHeader,
} from "../auth/acting";
import { checkPublicHttpsEndpoint } from "../custom-endpoint-validation";
import type { Agent, UserId, Workspace } from "../domain/types";
import {
  AgentNameConflictError,
  ApiKeyRejectedError,
  type RuntimeChannel,
} from "../ports";
import { isApiKeyProvider } from "../providers";
import { handleAttachments } from "../turn/attachments";
import { handleFiles } from "../turn/files";
import type { Vfs } from "../vfs";
import { handleActionApprovalsDispatch } from "./action-approvals";
import { stampTurnContributor } from "./activity-attribution";
import {
  type AgentRouteDeps,
  authorizeAgent,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
} from "./agent-authz";
import { handleAgentData } from "./agent-data";
import { handleAgentFile } from "./agent-file";
import { legacyAgentColor } from "./agent-legacy-color";
import { asSeedRecord, writeAgentSeeds } from "./agent-seed";
import { handleCustomIntegrationsDispatch } from "./custom-integrations-user";
import { json, readJson } from "./http";
import { handleMigration } from "./migration";
import { handlePortableExport } from "./portable";
import { handlePortableAnonymize } from "./portable-anonymize";
import { handlePortablePreview } from "./portable-preview";
import { handlePortableStore } from "./portable-store";
import { handleRoutineRuns } from "./routine-runs";
import { handleSkills } from "./skills";
import { handleSkillsRemote } from "./skills-remote";
import { handleTriggerStatus } from "./trigger-status";

// The deps bag + authz helpers moved to agent-authz.ts (shared with
// routine-runs.ts); re-exported so existing importers keep working.
export type { AgentRouteDeps } from "./agent-authz";

/**
 * The agent as the wire serves it: the record plus the deployment extras — the
 * real directory (`dir`, local profile only) and the Rust-era legacy `color`
 * (read from `.houston/agent.json`; the client overlay outranks it, see
 * agent-legacy-color.ts). Color is attached only where a vfs is wired.
 */
async function agentPayload(deps: AgentRouteDeps, ws: Workspace, agent: Agent) {
  const base = deps.agentDir
    ? { ...agent, dir: deps.agentDir(ws, agent) }
    : agent;
  if (!deps.vfs) return base;
  const paths = deps.paths ?? DEFAULT_PATHS;
  const color = await legacyAgentColor(deps.vfs, paths.agentRoot(ws, agent));
  return color ? { ...base, color } : base;
}

/**
 * One agent's turn/routine busy inputs — the shared core of the per-agent
 * probe below and the pod-level `GET /activity` aggregate. The caller resolves
 * the channel and the vfs first (the two probes answer their absence
 * differently: 503 per-agent, conservative busy at pod level).
 */
async function agentBusyInputs(
  deps: AgentRouteDeps,
  vfs: Vfs,
  channel: RuntimeChannel,
  ctx: { workspace: Workspace; agent: Agent },
): Promise<{ turnBusy: boolean; runningRoutineRuns: number }> {
  const paths = deps.paths ?? DEFAULT_PATHS;
  const runs = await loadRoutineRuns(
    vfs,
    paths.agentRoot(ctx.workspace, ctx.agent),
  );
  const runningRoutineRuns = runs.items.filter(
    (run) => run.status === "running",
  ).length;
  const turnBusy = await channel.busy(ctx);
  return { turnBusy, runningRoutineRuns };
}

async function activityStatus(
  deps: AgentRouteDeps,
  ctx: { workspace: Workspace; agent: Agent },
) {
  const channel = channelFor(deps, ctx.workspace);
  if (!channel) return null;
  if (!deps.vfs) return { error: "agent data not configured" as const };

  const { turnBusy, runningRoutineRuns } = await agentBusyInputs(
    deps,
    deps.vfs,
    channel,
    ctx,
  );
  const runtime = channel.runtimeStatus
    ? await channel.runtimeStatus(ctx)
    : "unknown";
  // Other /agents/* requests held open right now — minus this probe itself.
  // Catches what the turn check cannot: an open conversation-events SSE
  // subscription (an agent open in a UI tab) between turns. Two probes
  // overlapping see each other and both answer busy — conservative, and gone
  // by the next sweep.
  const activeRequests = deps.agentRequestCount
    ? Math.max(0, deps.agentRequestCount() - 1)
    : 0;
  return {
    busy: turnBusy || runningRoutineRuns > 0 || activeRequests > 0,
    runtime,
    runningRoutineRuns,
    activeRequests,
  };
}

/**
 * Pod-level busy aggregate for `GET /activity` (server.ts): every agent in
 * every workspace on this host — engine pods are single-tenant, so the
 * store-wide enumeration IS the pod's population. The control plane's
 * pre-roll probe (same parsing rule as the waker's idle sweep) treats
 * anything but a literal `busy: false` as busy, so `false` must mean
 * provably idle: an agent whose workspace has no channel wired, whose vfs is
 * unconfigured, or that throws while probed counts as busy rather than
 * failing the whole answer.
 */
export async function podActivityStatus(deps: AgentRouteDeps): Promise<{
  busy: boolean;
  activeRequests: number;
  runningRoutineRuns: number;
  busyAgents: number;
}> {
  // The counter is pod-global (server.ts counts /agents/*-prefixed requests),
  // so read it ONCE — and unlike the per-agent probe above, /activity is not
  // under /agents/, so it never counts itself: no self-subtraction here.
  const activeRequests = deps.agentRequestCount ? deps.agentRequestCount() : 0;
  let runningRoutineRuns = 0;
  let busyAgents = 0;
  for (const workspace of await deps.store.listWorkspaces()) {
    const channel = channelFor(deps, workspace);
    for (const agent of await deps.store.listAgents(workspace.id)) {
      if (!channel || !deps.vfs) {
        busyAgents++;
        continue;
      }
      try {
        const { turnBusy, runningRoutineRuns: running } = await agentBusyInputs(
          deps,
          deps.vfs,
          channel,
          { workspace, agent },
        );
        runningRoutineRuns += running;
        if (turnBusy || running > 0) busyAgents++;
      } catch {
        busyAgents++; // an unprobeable agent must not read as idle
      }
    }
  }
  return {
    busy: busyAgents > 0 || activeRequests > 0,
    activeRequests,
    runningRoutineRuns,
    busyAgents,
  };
}

/**
 * The user's agents: list/create/rename/delete, connect-once capture, and the
 * per-agent runtime dispatch (chat, SSE, providers, settings, files) — all
 * behind one ownership check, all hosting-model-agnostic via RuntimeChannel.
 * Returns true when the request was handled.
 */
export async function handleAgents(
  deps: AgentRouteDeps,
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // The user's own agents — their personal workspace, auto-provisioned on first hit.
  if (path === "/agents" && method === "GET") {
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    const agents = await deps.store.listAgents(ws.id);
    json(
      res,
      200,
      await Promise.all(agents.map((a) => agentPayload(deps, ws, a))),
    );
    return true;
  }
  if (path === "/agents" && method === "POST") {
    const body = await readJson(req);
    const { name } = body;
    if (!name || typeof name !== "string") {
      json(res, 400, { error: "missing 'name'" });
      return true;
    }
    // Optional create-time content: CLAUDE.md instructions + a flat seed-file
    // map (skills, seeded .houston data, working files). Builtin templates and
    // portable installs supply these; the Rust engine wrote them on install, so
    // the host must too or the agent is created empty. Both are untrusted input
    // — validate before writing.
    const claudeMd =
      typeof body.claudeMd === "string" ? body.claudeMd : undefined;
    let seeds: Record<string, string> | undefined;
    if (body.seeds !== undefined) {
      const parsed = asSeedRecord(body.seeds);
      if (!parsed) {
        json(res, 400, { error: "'seeds' must be a map of string→string" });
        return true;
      }
      seeds = parsed;
    }
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    const agent = await deps.store.createAgent({ workspaceId: ws.id, name });
    // Seed the .houston JSON schemas beside the (future) docs so the agent and
    // external tools can validate what they write. Skipped only when no vfs is
    // wired (legacy gke-only deploys); the typed-data routes 503 there anyway.
    if (deps.vfs) {
      const root = (deps.paths ?? DEFAULT_PATHS).agentRoot(ws, agent);
      try {
        await seedSchemas(deps.vfs, root);
        await writeAgentSeeds(deps.vfs, root, { claudeMd, seeds });
      } catch (err) {
        // Atomic-enough create: a seed-write failure must not leave a
        // permanently seedless agent. First-run reuses an existing record on
        // retry (ensureWorkspaceWithAssistant lists then reuses), so a
        // half-provisioned agent would never get re-seeded. Roll the just-created
        // record + its folder back so a retry recreates cleanly, then rethrow so
        // the failure still reaches the client (beta policy: no silent,
        // half-provisioned agents).
        try {
          await deps.vfs.deletePrefix(root);
          await deps.store.deleteAgent(agent.id);
        } catch (rollbackErr) {
          // Rollback itself failed — surface the ORIGINAL cause below, but leave
          // a breadcrumb for the orphaned record/folder.
          console.error(
            `[agents] seed rollback failed for ${agent.id}:`,
            rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
          );
        }
        throw err;
      }
    }
    deps.events?.emit(ws.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: ws.id,
    });
    json(res, 201, await agentPayload(deps, ws, agent));
    return true;
  }

  // Rename / delete a single agent (owner-only — in personal mode, everyone for their own).
  const single = path.match(/^\/agents\/([^/]+)$/);
  if (single && (method === "PATCH" || method === "DELETE")) {
    const agentId = single[1] ? decodeURIComponent(single[1]) : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }

    if (method === "PATCH") {
      const { name } = await readJson(req);
      if (!name || typeof name !== "string") {
        json(res, 400, { error: "missing 'name'" });
        return true;
      }
      // Quiesce the agent's standing runtime BEFORE the rename moves its
      // directory. A warm local runtime holds absolute paths into the OLD
      // directory (cwd + HOUSTON_DATA_DIR) and stays keyed under the OLD id in
      // the launcher, so a rename under it leaks the process and its next
      // write (conversation store, usage ledger, logs — all mkdir-recursive)
      // RESURRECTS the old-named folder, which the directory-derived local
      // store then re-lists as an agent with the old name ("my rename
      // reverted"). On Windows the live child's cwd even locks the directory
      // against the rename itself. The runtime respawns on the next dispatch
      // (pi's continueRecent restores its sessions from the renamed tree). A
      // quiesce failure surfaces — never rename under a live runtime.
      if (name !== authz.agent.name) {
        const channel = channelFor(deps, authz.workspace);
        if (channel?.quiesce) {
          await channel.quiesce({
            workspace: authz.workspace,
            agent: authz.agent,
          });
        }
      }
      let renamed: Agent;
      try {
        renamed = await deps.store.renameAgent(agentId, name);
      } catch (err) {
        if (err instanceof AgentNameConflictError) {
          json(res, 409, { error: err.message });
          return true;
        }
        throw err;
      }
      deps.events?.emit(authz.workspace.ownerUserId, {
        type: "AgentsChanged",
        workspaceId: authz.workspace.id,
      });
      json(res, 200, await agentPayload(deps, authz.workspace, renamed));
      return true;
    }

    // DELETE: tear the agent's runtime-side state down first (so a failure is
    // retryable with the record intact), then drop the record. Errors surface —
    // never a silent orphan.
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    await channel.teardown({ workspace: authz.workspace, agent: authz.agent });
    await deps.store.deleteAgent(agentId);
    deps.events?.emit(authz.workspace.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: authz.workspace.id,
    });
    json(res, 200, { ok: true });
    return true;
  }

  // Capture (connect-once): after the user connects an agent's subscription,
  // persist the credential for the WHOLE workspace so every agent (existing +
  // new) serves from it. Must precede the generic dispatch.
  const capture = path.match(/^\/agents\/([^/]+)\/credential\/capture$/);
  if (capture && method === "POST") {
    const agentId = capture[1] ? decodeURIComponent(capture[1]) : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    // The just-connected provider id, so capture exports THAT credential rather
    // than whichever OAuth credential comes first in the runtime's auth.json.
    const body = (await readJson(req).catch(() => ({}))) as {
      provider?: unknown;
    };
    const provider =
      typeof body.provider === "string" ? body.provider : undefined;
    const result = await channel.captureCredential(
      { workspace: authz.workspace, agent: authz.agent },
      provider,
    );
    if (result.ok) json(res, 200, { ok: true, provider: result.provider });
    else
      json(res, result.status, {
        error: result.error,
        ...(result.detail ? { detail: result.detail } : {}),
      });
    return true;
  }

  // Forget (connect-once logout): drop the workspace credential for a provider so
  // no future turn can re-serve it. Clearing only the agent runtime's local
  // auth.json left the central store intact, and the next turn re-hydrated the
  // agent from it — the provider showed connected again. Must precede dispatch.
  const forget = path.match(/^\/agents\/([^/]+)\/credential\/forget$/);
  if (forget && method === "POST") {
    const agentId = forget[1] ? decodeURIComponent(forget[1]) : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const { provider } = await readJson(req);
    if (!provider || typeof provider !== "string") {
      json(res, 400, { error: "missing 'provider'" });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    await channel.forgetCredential(
      { workspace: authz.workspace, agent: authz.agent },
      provider,
    );
    if (
      provider === "openai-compatible" &&
      deps.gatewayFronted &&
      deps.sharedEndpoints
    ) {
      try {
        await deps.sharedEndpoints.remove({ ownerOnly: true });
      } catch (err) {
        console.error(
          "[shared-endpoint] owner-only logout cleanup failed:",
          err,
        );
        json(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        });
        return true;
      }
    }
    json(res, 200, { ok: true });
    return true;
  }

  // Connect an API-key provider: the user pastes a key, no
  // OAuth dance. Stored centrally for the whole workspace (and pushed into the
  // standing runtime so it reads as connected at once). Must precede dispatch.
  const apiKey = path.match(/^\/agents\/([^/]+)\/credential\/api-key$/);
  if (apiKey && method === "POST") {
    const agentId = apiKey[1] ? decodeURIComponent(apiKey[1]) : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const { provider, apiKey: key } = await readJson(req);
    if (
      !provider ||
      typeof provider !== "string" ||
      !isApiKeyProvider(provider)
    ) {
      json(res, 400, { error: "unknown API-key provider" });
      return true;
    }
    if (!key || typeof key !== "string" || !key.trim()) {
      json(res, 400, { error: "missing 'apiKey'" });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    try {
      await channel.saveApiKeyCredential(
        { workspace: authz.workspace, agent: authz.agent },
        provider,
        key.trim(),
      );
      json(res, 200, { ok: true, provider });
    } catch (err) {
      // Forward the runtime's typed verification reason so the connect
      // dialog can show actionable copy (bad key vs restricted key vs outage).
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof ApiKeyRejectedError && err.reason
          ? { reason: err.reason }
          : {}),
      });
    }
    return true;
  }

  // Connect the Claude subscription in HOSTED mode: `claude auth login` mints the
  // OAuth credential locally on the desktop, which extracts it and pushes it here
  // so a hosted pod's Claude Agent SDK can authenticate + self-refresh. Same owner
  // authz as capture. The envelope is validated (accessToken required) — a
  // malformed push is a clear 4xx (never a false success), so the desktop can fall
  // back to the paste flow. Must precede the generic dispatch.
  const claudeOAuth = path.match(
    /^\/agents\/([^/]+)\/credential\/claude-oauth$/,
  );
  if (claudeOAuth && method === "POST") {
    const agentId = claudeOAuth[1]
      ? decodeURIComponent(claudeOAuth[1])
      : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    // A body that isn't valid JSON parses to {} → the validator rejects it as
    // "missing 'claudeAiOauth'" (a clean 400), never a swallowed accept.
    const parsed = parseClaudeOAuthEnvelope(
      await readJson(req).catch(() => ({})),
    );
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    try {
      await channel.saveClaudeOAuthCredential(
        { workspace: authz.workspace, agent: authz.agent },
        parsed.value,
        // `?if_absent=1` marks a fill-only push of a CACHED snapshot (the
        // desktop reconcile) — never allowed to clobber a live central
        // credential whose refresh token may have rotated since (HOU-855).
        { ifAbsent: url.searchParams.get("if_absent") === "1" },
      );
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // Connect an OpenAI-compatible server: a base URL + model. Desktop/self-host
  // point it at the user's own machine (Ollama / vLLM / LM Studio); a cloud pod
  // points it at a public HTTPS endpoint the user hosts (tunnel or directly
  // hosted). Gated on the deployment capability, then — on the managed cloud
  // profile only — validated against the pod's public-:443-only egress. Must
  // precede the generic dispatch.
  const customEndpoint = path.match(
    /^\/agents\/([^/]+)\/provider\/openai-compatible$/,
  );
  if (customEndpoint && method === "POST") {
    const agentId = customEndpoint[1]
      ? decodeURIComponent(customEndpoint[1])
      : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    if (!deps.capabilities?.openaiCompatible) {
      json(res, 400, {
        error:
          "This deployment doesn't support custom OpenAI-compatible endpoints.",
      });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const body = await readJson(req);
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!baseUrl) {
      json(res, 400, { error: "missing 'baseUrl'" });
      return true;
    }
    if (!model) {
      json(res, 400, { error: "missing 'model'" });
      return true;
    }
    // Validate the scheme at the boundary (mirrors the runtime's check) so a bad
    // URL is a clean 400 here rather than a 502 bounced off the runtime, and a
    // non-http(s) scheme never reaches the agent's egress.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      json(res, 400, { error: "baseUrl is not a valid URL" });
      return true;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      json(res, 400, { error: "baseUrl must start with http:// or https://" });
      return true;
    }
    // Managed cloud pods (gatewayFronted) egress ONLY to public TCP 443 — the
    // NetworkPolicy drops private/loopback/link-local and the metadata IP. Reject
    // an unreachable endpoint at save time with an actionable reason rather than
    // failing every turn opaquely. Desktop/self-host (not gateway-fronted) keep
    // accepting localhost, so they skip this check entirely — as does the dev
    // launcher (loopbackEgress), whose "pods" run on the developer's machine
    // and genuinely reach a local model server.
    if (deps.gatewayFronted && !deps.loopbackEgress) {
      const check = checkPublicHttpsEndpoint(parsedUrl);
      if (!check.ok) {
        json(res, 400, { error: check.reason });
        return true;
      }
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    const endpoint: CustomEndpoint = {
      baseUrl,
      model,
      name: typeof body.name === "string" ? body.name : undefined,
      contextWindow:
        typeof body.contextWindow === "number" ? body.contextWindow : undefined,
      reasoning:
        typeof body.reasoning === "boolean" ? body.reasoning : undefined,
      shared: body.shared === true ? true : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    };
    let endpointSaved = false;
    try {
      await channel.saveCustomEndpoint(
        { workspace: authz.workspace, agent: authz.agent },
        endpoint,
      );
      endpointSaved = true;
      if (deps.gatewayFronted && deps.sharedEndpoints) {
        if (endpoint.shared === true) {
          await deps.sharedEndpoints.put({
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            ...(endpoint.name !== undefined ? { name: endpoint.name } : {}),
            ...(endpoint.contextWindow !== undefined
              ? { contextWindow: endpoint.contextWindow }
              : {}),
            ...(endpoint.reasoning !== undefined
              ? { reasoning: endpoint.reasoning }
              : {}),
            ...(endpoint.apiKey !== undefined
              ? { apiKey: endpoint.apiKey }
              : {}),
          });
        } else {
          await deps.sharedEndpoints.remove({ ownerOnly: true });
        }
      }
      json(res, 200, { ok: true });
    } catch (err) {
      if (endpointSaved && deps.gatewayFronted && deps.sharedEndpoints) {
        console.error("[shared-endpoint] save synchronization failed:", err);
      }
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // Routine-run routes (run-now / cancel) — matched before the generic
  // dispatch below; the runtime has no routine routes. See routine-runs.ts.
  if (await handleRoutineRuns(deps, userId, method, path, res)) return true;

  const activity = path.match(/^\/agents\/([^/]+)\/activity$/);
  if (activity && method === "GET") {
    const agentId = activity[1] ? decodeURIComponent(activity[1]) : undefined;
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const status = await activityStatus(deps, {
      workspace: authz.workspace,
      agent: authz.agent,
    });
    if (!status) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    if ("error" in status) {
      json(res, 503, { error: status.error });
      return true;
    }
    json(res, 200, status);
    return true;
  }

  // The per-agent runtime surface: /agents/:agentId/<anything> → the agent's
  // runtime, via the workspace's channel. The frontend points its runtime
  // client at `${controlPlaneUrl}/agents/${agentId}`, so chat turns, the SSE
  // event stream, and the provider connect flow all reach the runtime under
  // one ownership-checked dispatch.
  const dispatch = path.match(/^\/agents\/([^/]+)\/(.+)$/);
  if (dispatch) {
    const agentId = dispatch[1] ? decodeURIComponent(dispatch[1]) : undefined;
    const rest = dispatch[2];
    if (!agentId || !rest) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const ctx = { workspace: authz.workspace, agent: authz.agent };
    // Reactivity emits target the workspace owner (the only member, personal tier).
    const emit = deps.events
      ? (event: HoustonEvent) =>
          deps.events?.emit(authz.workspace.ownerUserId, event)
      : undefined;

    // Action approvals are served by the HOST off its approval store — on this
    // dispatch surface because it is the one per-agent surface the hosted
    // gateway proxies to a pod (see routes/action-approvals.ts).
    if (
      await handleActionApprovalsDispatch(
        deps.actionApprovals,
        agentId,
        method,
        rest,
        req,
        res,
      )
    )
      return true;

    // Custom-integration user routes (list / remove / provide-credential) on
    // the dispatch surface — the hosted gateway proxies ONLY this per-agent
    // form to the pod (its own /v1/integrations subtree is Composio-only), so
    // the in-chat secure credential card calls it in both deployments
    // (HOU-823). See routes/custom-integrations-user.ts.
    if (
      await handleCustomIntegrationsDispatch(
        deps.customIntegrations,
        method,
        rest,
        req,
        res,
      )
    )
      return true;

    // Typed .houston families + skills are served by the HOST off the workspace
    // vfs — the runtime surface (chat, auth, settings, files) goes to the channel.
    const paths = deps.paths ?? DEFAULT_PATHS;
    // WHO a routine write records as its acting identity (C2). A gateway-fronted
    // pod authenticates every request as its single local user, and that id has
    // no membership upstream — a routine stamped with it 401s every integration
    // call when it fires (HOU-689). The gateway minted the acting-as header for
    // exactly this: its sub is the identity the gateway re-authorizes at fire
    // time. On the desktop the header is untrusted client input, so the local
    // userId stays the recorded creator (routine turns there authenticate with
    // the frontend session instead).
    const routineActor = deps.gatewayFronted
      ? actingSubFromHeader(req.headers[ACTING_AS_HEADER])
      : userId;
    // The acting human as a full contributor, stamped onto missions (activity
    // create/PATCH + turns). CRITICAL: null off the gateway (desktop/self-host),
    // so single-player activity.json gains no attribution keys and stays
    // byte-identical. Does NOT change routineActor.
    const actingAuthor = deps.gatewayFronted
      ? actingAuthorFromHeader(req.headers[ACTING_AS_HEADER])
      : null;
    if (
      await handleAgentData(
        deps.vfs,
        paths,
        ctx,
        method,
        rest,
        req,
        res,
        emit,
        routineActor,
        actingAuthor ?? undefined,
        deps.triggersEnabled ?? false,
      )
    )
      return true;
    // Per-routine trigger health. On a deployment without a trigger backend this
    // reports every trigger-bound routine as a hard error (it can never wake);
    // where triggers CAN fire it steps aside for the real backend.
    if (
      await handleTriggerStatus(
        deps.vfs,
        paths,
        ctx,
        method,
        rest,
        res,
        deps.triggersEnabled ?? false,
      )
    )
      return true;
    if (
      await handleAgentFile(deps.vfs, paths, ctx, method, rest, req, res, emit)
    )
      return true;
    if (await handleSkills(deps.vfs, paths, ctx, method, rest, req, res, emit))
      return true;
    if (
      await handleSkillsRemote(
        deps.vfs,
        paths,
        ctx,
        method,
        rest,
        req,
        res,
        emit,
      )
    )
      return true;
    // The Files tab: served by the HOST off the workspace vfs for every profile
    // (the runtime has no /files route). Same handler cloud + local — zero drift.
    if (
      await handleFiles(
        deps.vfs,
        paths,
        ctx,
        method,
        rest,
        req,
        res,
        url.searchParams,
        emit,
      )
    )
      return true;
    // Composer attachments: uploaded into the workspace's visible `uploads/`
    // folder so the runtime's clamped file tools can Read them during this turn
    // AND any later conversation (the runtime has no /attachments).
    if (
      await handleAttachments(
        deps.vfs,
        paths,
        ctx,
        method,
        rest,
        req,
        res,
        emit,
      )
    )
      return true;
    if (
      await handlePortablePreview(
        { vfs: deps.vfs, paths },
        ctx,
        method,
        rest,
        req,
        res,
      )
    )
      return true;
    if (
      await handlePortableAnonymize(
        // The channel carries the AI pass into the agent's runtime; absent
        // (or unsupported) the route falls back to the regex redactor.
        {
          vfs: deps.vfs,
          paths,
          channel: channelFor(deps, authz.workspace) ?? undefined,
        },
        ctx,
        method,
        rest,
        req,
        res,
      )
    )
      return true;
    if (
      await handlePortableExport(
        { vfs: deps.vfs, paths },
        ctx,
        method,
        rest,
        req,
        res,
      )
    )
      return true;
    // Desktop→cloud migration (HOU-719): export on the source host, import +
    // completion marker on the target. agentDir anchors re-synthesized pi
    // sessions on deployments with a real on-disk tree.
    if (
      await handleMigration(
        {
          vfs: deps.vfs,
          paths,
          agentDir: deps.agentDir?.(authz.workspace, authz.agent),
        },
        ctx,
        method,
        rest,
        req,
        res,
        emit,
      )
    )
      return true;
    if (
      await handlePortableStore(
        {
          vfs: deps.vfs,
          paths,
        },
        { ...ctx, userId },
        method,
        rest,
        req,
        res,
      )
    )
      return true;

    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    // Teams attribution: a user turn (POST …/conversations/:cid/messages) marks
    // the acting human as a contributor on the mission it drives. Best-effort
    // metadata that never blocks the turn (see activity-attribution.ts); runs
    // only when a gateway vouched for the actor (actingAuthor non-null).
    if (actingAuthor && deps.vfs) {
      const turnMatch =
        method === "POST"
          ? rest.match(/^conversations\/([^/]+)\/messages$/)
          : null;
      if (turnMatch?.[1]) {
        await stampTurnContributor(
          deps.vfs,
          paths.agentRoot(ctx.workspace, ctx.agent),
          ctx.agent.id,
          decodeURIComponent(turnMatch[1]),
          actingAuthor,
          emit,
        );
      }
    }
    await channel.dispatch(ctx, method, rest, url, req, res);
    return true;
  }

  return false;
}
