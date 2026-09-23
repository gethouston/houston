import { CustomIntegrationError } from "@houston/host/src/integrations/custom/types";
import { IntegrationUpstreamError } from "@houston/host/src/integrations/types";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { TurnCodeVm } from "../code-vm/turn-code-vm";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import {
  createTurnCustomContext,
  type TurnCustomContext,
} from "./turn-custom-context";
import { TurnDocConflictError } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnCodeRoute, TURN_CODE_RUN_PATH } from "./turn-sandbox-code";
import { makeTurnVmCodeRoute } from "./turn-sandbox-code-vm";
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
  /** Present in `vm` mode: this turn's own code micro-VM, closed on dispose. */
  codeVm?: TurnCodeVm;
}

/** Mutation-derived views published after the turn's object sync lands. */
export interface TurnSandboxViews {
  customDefinitions?: unknown;
}

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

/** The JSON object a facade route expects, or null when the body is not one. */
function parseBody(
  raw: BodyInit | null | undefined,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function customStatus(error: CustomIntegrationError): number {
  return error.code === "not_found"
    ? 404
    : error.code === "duplicate_slug"
      ? 409
      : 400;
}

/** Build the `/sandbox/*` facade available only for this granted turn. */
export function makeTurnSandboxFetch(deps: TurnSandboxDeps): {
  call: SandboxFetch;
  dispose: () => Promise<void>;
  views: () => TurnSandboxViews;
  /** Start the turn's code VM booting; a no-op outside `vm` mode. */
  warmCode: () => void;
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
  // Scope-gated at BUILD time: without `code-run` the path is simply not a
  // route this turn has, so it 404s like any other unknown one. The grant
  // decides WHETHER the turn runs code; the worker's mode decides WHERE.
  const canRunCode = deps.grant.scopes.includes("code-run");
  const codeVm = canRunCode ? deps.codeVm : undefined;
  const codeRun = !canRunCode
    ? null
    : codeVm
      ? makeTurnVmCodeRoute(codeVm)
      : makeTurnCodeRoute(deps, fetchImpl);
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
    try {
      // The code relay forwards the RAW body: a run request carries base64
      // input files up to the gateway's 32 MiB cap, and parsing then
      // re-serializing it here would copy the whole payload for nothing.
      if (codeRun && path === TURN_CODE_RUN_PATH) {
        return await codeRun(
          typeof init?.body === "string" ? init.body : "{}",
          init?.signal,
        );
      }
      const body = parseBody(init?.body);
      if (!body) return json(400, { error: "invalid JSON body" });
      if (/^\/sandbox\/integrations\/(search|execute)$/.test(path))
        return await integrations(path, body, init?.signal);
      if (
        /^\/sandbox\/integrations\/custom\/(detect|add|remove|status)$/.test(
          path,
        )
      )
        return await customRoute(path, body, init?.signal);
      const write = await handleTurnWriteRoute(path, body, deps);
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
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error;
      console.error(`[turn-sandbox] request failed (${detail})`);
      return json(500, { error: "sandbox request failed" });
    }
  };
  const dispose = async () => {
    // The VM goes first and regardless: it holds this tenant's processes.
    try {
      await deps.codeVm?.close();
    } finally {
      await resetCustom();
    }
  };
  return {
    call,
    dispose,
    views: () => ({ ...views }),
    warmCode: () => codeVm?.warm(),
  };
}
