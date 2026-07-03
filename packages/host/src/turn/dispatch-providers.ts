import type { IncomingMessage, ServerResponse } from "node:http";
import type { Workspace } from "../domain/types";
import type { WorkspaceCredential } from "../ports";
import { CLOUD_PROVIDERS, isApiKeyProvider, providerName } from "../providers";
import { json, PROVIDER, readJson, readSettings, type TurnDeps } from "./deps";

/**
 * The provider/settings/auth half of the cloudrun dispatch (see dispatch.ts):
 * providers + settings read/write against the workspace prefix in object
 * storage, auth status/login/logout against the central credential store.
 * Returns false when the route isn't one of these (the dispatcher 404s).
 */
export async function dispatchProviderRoutes(
  deps: TurnDeps,
  ws: Workspace,
  prefix: string,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // Which cloud providers this workspace has connected, and the active one (the
  // saved active provider if still connected, else the first connected).
  const connectedCloud = async (): Promise<{
    creds: Map<string, WorkspaceCredential | null>;
    active: string | null;
    settings: Awaited<ReturnType<typeof readSettings>>;
  }> => {
    const settings = await readSettings(deps, prefix);
    const creds = new Map<string, WorkspaceCredential | null>();
    for (const p of CLOUD_PROVIDERS)
      creds.set(p.id, await deps.credentials.get(ws.id, p.id));
    const active =
      settings.activeProvider && creds.get(settings.activeProvider)
        ? settings.activeProvider
        : (CLOUD_PROVIDERS.find((p) => creds.get(p.id))?.id ?? null);
    return { creds, active, settings };
  };

  if (method === "GET" && rest === "providers") {
    const { creds, active, settings } = await connectedCloud();
    json(
      res,
      200,
      CLOUD_PROVIDERS.map((p) => {
        const models =
          p.id === PROVIDER ? deps.codexModels : [...(p.models ?? [])];
        return {
          id: p.id,
          name: p.name,
          configured: !!creds.get(p.id),
          isActive: p.id === active,
          activeModel:
            settings.models?.[p.id] ?? p.defaultModel ?? models[0] ?? "",
          models,
        };
      }),
    );
    return true;
  }

  if (method === "PUT" && rest === "settings") {
    const body = await readJson(req);
    const settings = await readSettings(deps, prefix);
    if (typeof body.activeProvider === "string")
      settings.activeProvider = body.activeProvider;
    if (typeof body.model === "string") {
      const prov =
        (typeof body.activeProvider === "string"
          ? body.activeProvider
          : settings.activeProvider) ?? PROVIDER;
      settings.models = { ...settings.models, [prov]: body.model };
    }
    if (typeof body.effort === "string") settings.effort = body.effort;
    await deps.vfs.writeText(
      `${prefix}/data/settings.json`,
      JSON.stringify(settings),
    );
    json(res, 200, settings);
    return true;
  }

  if (method === "GET" && rest === "auth/status") {
    const { creds, active } = await connectedCloud();
    // Only the OAuth providers have an in-flight device-code login state; the
    // api-key gateways have none (the user pastes a key via the host route).
    const login = await deps.connect.status(ws.id);
    json(res, 200, {
      providers: CLOUD_PROVIDERS.map((p) => ({
        provider: p.id,
        name: p.name,
        configured: !!creds.get(p.id),
        login: p.id === PROVIDER ? login : null,
      })),
      activeProvider: active,
    });
    return true;
  }

  const auth = rest.match(/^auth\/([^/]+)\/(login|logout)$/);
  if (auth && method === "POST") {
    const pid = auth[1] ?? "";
    if (auth[2] === "logout") {
      await deps.credentials.remove(ws.id, pid);
      json(res, 200, { ok: true });
      return true;
    }
    // OAuth sign-in is Codex-only in cloud (Anthropic is ToS-off). The api-key
    // gateways connect through POST /agents/:id/credential/api-key, not here.
    if (pid !== PROVIDER) {
      json(res, 400, {
        error: isApiKeyProvider(pid)
          ? `${providerName(pid)} connects with an API key, not OAuth sign-in`
          : `cloud agents support only ${PROVIDER} sign-in`,
      });
      return true;
    }
    json(res, 200, await deps.connect.start(ws.id));
    return true;
  }

  return false;
}
