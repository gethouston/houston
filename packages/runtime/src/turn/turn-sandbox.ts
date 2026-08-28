import { loadSkills } from "@houston/domain";
import { CustomIntegrationError } from "@houston/host/src/integrations/custom/types";
import { IntegrationUpstreamError } from "@houston/host/src/integrations/types";
import { SkillRemoteError } from "@houston/host/src/skills/remote-error";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import {
  createTurnCustomContext,
  type TurnCustomContext,
} from "./turn-custom-context";
import { TurnDocConflictError } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnCustomRoutes } from "./turn-sandbox-custom";
import {
  makeTurnIntegrationRoutes,
  TurnGrantExpiredError,
} from "./turn-sandbox-integrations";
import { fetchWithTurnSignal } from "./turn-sandbox-signal";
import { handleTurnWriteRoute } from "./turn-sandbox-writes";
import type { TurnGrant } from "./types";

/** Dependencies captured by a single turn's sandbox routing closure. */
export interface TurnSandboxDeps {
  grant: TurnGrant;
  hostToken: string;
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  workspaceId: string;
  conversationId: string;
  actingAs?: { userId: string; name?: string };
  orgSlug: string;
  agentSlug: string;
  fetchImpl?: typeof fetch;
}

/** Mutation-derived views published after the turn's object sync lands. */
export interface TurnSandboxViews {
  skills?: unknown;
  customDefinitions?: unknown;
}

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

function customStatus(error: CustomIntegrationError): number {
  return error.code === "not_found"
    ? 404
    : error.code === "duplicate_slug"
      ? 409
      : 400;
}

function skillFailure(error: unknown): Response {
  if (!(error instanceof SkillRemoteError)) {
    return json(502, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const code =
    error.httpStatus === 400
      ? "BAD_REQUEST"
      : error.httpStatus === 404
        ? "NOT_FOUND"
        : "UNAVAILABLE";
  return json(error.httpStatus, {
    error: {
      code,
      message: error.message,
      kind: error.kind,
      details: { kind: error.kind },
    },
  });
}

/** Build the `/sandbox/*` facade available only for this granted turn. */
export function makeTurnSandboxFetch(deps: TurnSandboxDeps): {
  call: SandboxFetch;
  dispose: () => Promise<void>;
  views: () => TurnSandboxViews;
} {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const views: TurnSandboxViews = {};
  const custom = new Map<AbortSignal | null, TurnCustomContext>();
  const getCustom = async (signal?: AbortSignal | null) => {
    const key = signal ?? null;
    const existing = custom.get(key);
    if (existing) return existing;
    const context = await createTurnCustomContext({
      ...deps,
      grantUrl: deps.grant.url,
      fetchImpl: fetchWithTurnSignal(fetchImpl, signal),
    });
    custom.set(key, context);
    return context;
  };
  const resetCustom = async () => {
    const contexts = [...custom.values()];
    custom.clear();
    await Promise.all(contexts.map((context) => context.dispose()));
  };
  const integrations = makeTurnIntegrationRoutes(deps, fetchImpl, getCustom);
  const customRoute = makeTurnCustomRoutes(
    deps,
    getCustom,
    resetCustom,
    (view) => {
      views.customDefinitions = view;
    },
  );

  const call: SandboxFetch = async (path, init) => {
    if ((init?.method ?? "GET") !== "POST")
      return json(405, { error: "method not allowed" });
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      );
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: "invalid JSON body" });
    }
    try {
      if (/^\/sandbox\/integrations\/(search|execute)$/.test(path))
        return await integrations(path, body, init?.signal);
      if (
        /^\/sandbox\/integrations\/custom\/(detect|add|remove|status)$/.test(
          path,
        )
      )
        return await customRoute(path, body, init?.signal);
      const write = await handleTurnWriteRoute(path, body, {
        ...deps,
        fetchImpl: fetchWithTurnSignal(fetchImpl, init?.signal),
        ...(init?.signal ? { signal: init.signal } : {}),
      });
      if (write?.ok && path === "/sandbox/skills/install") {
        views.skills = await loadSkills(
          deps.filesystem.vfs,
          deps.filesystem.workspaceRel,
        );
      }
      return write ?? json(404, { error: "unknown sandbox route" });
    } catch (error) {
      if (init?.signal?.aborted) throw init.signal.reason ?? error;
      if (error instanceof TurnGrantExpiredError)
        return json(401, {
          error: "turn grant expired",
          code: "grant_expired",
        });
      if (error instanceof IntegrationUpstreamError)
        return json(error.status, error.body);
      if (error instanceof CustomIntegrationError)
        return json(customStatus(error), {
          error: error.message,
          code: error.code,
        });
      if (error instanceof TurnDocConflictError)
        return json(409, { error: error.message, code: error.code });
      if (path.startsWith("/sandbox/skills/")) return skillFailure(error);
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error;
      console.error(`[turn-sandbox] request failed (${detail})`);
      return json(500, { error: "sandbox request failed" });
    }
  };
  return { call, dispose: resetCustom, views: () => ({ ...views }) };
}
