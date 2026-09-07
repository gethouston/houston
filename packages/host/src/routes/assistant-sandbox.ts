import type { IncomingMessage, ServerResponse } from "node:http";
import type { AssistantCatalog } from "../assistant/catalog";
import {
  assistantCatalogPath,
  processAssistantCatalog,
} from "../assistant/catalog-source";
import { ACTING_AS_HEADER } from "../auth/acting";
import type { CredentialVault } from "../ports";
import { dispatchAssistantOperation } from "./assistant-dispatch";
import {
  type AssistantGateway,
  forwardAssistantCall,
} from "./assistant-forward";
import { resolveAssistantGateway } from "./assistant-wiring";
import { bearer, header, json, readJson } from "./http";

/**
 * The RUNTIME-facing assistant dispatcher (`POST /sandbox/assistant/call`, HMAC
 * sandbox token) — what the agent's `houston_call` tool proxies through.
 *
 * WHY the host sits in the middle: the runtime is the least-trusted part of the
 * system, so it must never hold the credential that can act on a user's Houston
 * account. It carries only its per-sandbox token; THIS route holds the gateway
 * token, resolves the named operation against the generated catalog
 * (`assistant/catalog.ts`, fail-closed), and relays the caller's verified
 * acting identity so the gateway authorizes the real person rather than the pod.
 *
 * Trust posture matches the other `/sandbox/*` proxies: the token resolves to
 * one sandbox, the request body is re-validated here, and nothing the runtime
 * sends decides the destination beyond naming a catalogued operation.
 */

export const ASSISTANT_CALL_PATH = "/sandbox/assistant/call";

export type { AssistantGateway } from "./assistant-forward";

export interface AssistantSandboxDeps {
  vault: CredentialVault;
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Where operations are performed. `local/host.ts` sets it from the ONE
   * resolver (`assistant-wiring.ts`), which is also what the default below
   * calls — a server built without this seam still reads the configured env
   * pair, and nothing else.
   */
  assistantGateway?: () => AssistantGateway | null;
  /** Injection point for tests; production reads the packaged catalog once. */
  assistantCatalog?: () => AssistantCatalog | null;
}

export async function handleSandboxAssistant(
  deps: AssistantSandboxDeps,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== ASSISTANT_CALL_PATH) return false;
  if (method !== "POST") {
    json(res, 405, { error: "method not allowed", code: "method_not_allowed" });
    return true;
  }

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/missions.
  const sbToken = bearer(req, url);
  if (!sbToken || !deps.vault.validateSandboxToken(sbToken)) {
    json(res, 401, { error: "unauthorized", code: "unauthorized" });
    return true;
  }

  const gateway = (deps.assistantGateway ?? resolveAssistantGateway)();
  if (!gateway) {
    json(res, 501, {
      error:
        "this host performs no Houston operations: set HOUSTON_ASSISTANT_CP_URL and HOUSTON_ASSISTANT_TOKEN",
      code: "assistant_not_configured",
    });
    return true;
  }

  // A configured gateway with no catalog is a BROKEN deployment, not an off
  // one: the image failed to package the generated file. 503, and the loader
  // has already named the path it looked at in the boot log.
  const catalog = (deps.assistantCatalog ?? processAssistantCatalog)();
  if (!catalog) {
    console.error(
      `[assistant] no operation catalog at ${assistantCatalogPath()}: this host can perform nothing`,
    );
    json(res, 503, {
      error:
        "this host has no Houston operation catalog: package ui/engine-client/generated/assistant-catalog.json and point HOUSTON_ASSISTANT_CATALOG at it",
      code: "assistant_catalog_unavailable",
    });
    return true;
  }

  const payload = await readJson(req);
  const operation =
    typeof payload.operation === "string" ? payload.operation : "";
  const params = (payload.params ?? {}) as Record<string, unknown>;
  const dispatch = dispatchAssistantOperation(catalog, operation, params);
  if (!dispatch.ok) {
    json(res, 400, { error: dispatch.message, code: dispatch.code });
    return true;
  }

  await forwardAssistantCall(
    gateway,
    dispatch.request,
    {
      operation,
      actingAs: header(req, ACTING_AS_HEADER),
      fetchImpl: deps.fetchImpl ?? fetch,
    },
    res,
  );
  return true;
}
