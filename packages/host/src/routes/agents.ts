import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutineRuns, seedSchemas } from "@houston/domain";
import {
  type CustomEndpoint,
  type HoustonEvent,
  parseClaudeOAuthEnvelope,
} from "@houston/protocol";
import { ACTING_AS_HEADER, actingSubFromHeader } from "../auth/acting";
import { checkPublicHttpsEndpoint } from "../custom-endpoint-validation";
import type { Agent, UserId, Workspace } from "../domain/types";
import { isApiKeyProvider } from "../providers";
import { handleAttachments } from "../turn/attachments";
import { handleFiles } from "../turn/files";
import {
  type AgentRouteDeps,
  authorizeAgent,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
} from "./agent-authz";
import { handleAgentData } from "./agent-data";
import { handleAgentFile } from "./agent-file";
import { asSeedRecord, writeAgentSeeds } from "./agent-seed";
import { json, readJson } from "./http";
import { handlePortableExport } from "./portable";
import { handlePortableAnonymize } from "./portable-anonymize";
import { handlePortablePreview } from "./portable-preview";
import { handleRoutineRuns } from "./routine-runs";
import { handleSkills } from "./skills";
import { handleSkillsRemote } from "./skills-remote";

// The deps bag + authz helpers moved to agent-authz.ts (shared with
// routine-runs.ts); re-exported so existing importers keep working.
export type { AgentRouteDeps } from "./agent-authz";

/** Attach the agent's real directory (`dir`) when this deployment has one. */
function withAgentDir(deps: AgentRouteDeps, ws: Workspace, agent: Agent) {
  return deps.agentDir ? { ...agent, dir: deps.agentDir(ws, agent) } : agent;
}

async function activityStatus(
  deps: AgentRouteDeps,
  ctx: { workspace: Workspace; agent: Agent },
) {
  const channel = channelFor(deps, ctx.workspace);
  if (!channel) return null;
  if (!deps.vfs) return { error: "agent data not configured" as const };

  const paths = deps.paths ?? DEFAULT_PATHS;
  const runs = await loadRoutineRuns(
    deps.vfs,
    paths.agentRoot(ctx.workspace, ctx.agent),
  );
  const runningRoutineRuns = runs.items.filter(
    (run) => run.status === "running",
  ).length;
  const turnBusy = await channel.busy(ctx);
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
      agents.map((a) => withAgentDir(deps, ws, a)),
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
      await seedSchemas(deps.vfs, root);
      await writeAgentSeeds(deps.vfs, root, { claudeMd, seeds });
    }
    deps.events?.emit(ws.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: ws.id,
    });
    json(res, 201, withAgentDir(deps, ws, agent));
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
      const renamed = await deps.store.renameAgent(agentId, name);
      deps.events?.emit(authz.workspace.ownerUserId, {
        type: "AgentsChanged",
        workspaceId: authz.workspace.id,
      });
      json(res, 200, withAgentDir(deps, authz.workspace, renamed));
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
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
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
    // accepting localhost, so they skip this check entirely.
    if (deps.gatewayFronted) {
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
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    };
    try {
      await channel.saveCustomEndpoint(
        { workspace: authz.workspace, agent: authz.agent },
        endpoint,
      );
      json(res, 200, { ok: true });
    } catch (err) {
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

    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    await channel.dispatch(ctx, method, rest, url, req, res);
    return true;
  }

  return false;
}
