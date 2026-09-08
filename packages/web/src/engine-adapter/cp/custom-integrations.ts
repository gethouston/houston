import type {
  AddCustomIntegrationInput,
  CustomDetectResult,
  CustomIntegrationView,
  CustomToolInfo,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Custom integrations (HOU-550): the outside apps a user adds themselves from
 * a link — their own API or MCP servers. The Composio-backed catalog of
 * connectable providers is a different family; see `integrations.ts`.
 */

// A deployment without the custom-integrations surface (older host) answers
// 404 on the definitions read; that is a legitimate "feature absent" shape, so
// it maps to null (the section stays hidden) rather than surfacing an error.
// The write routes have no such fallback — a failure there is a real failure.

/**
 * Lists the outside apps the user added themselves.
 * @assistant group:integrations
 */
export async function customIntegrations(
  cfg: ControlPlaneConfig,
): Promise<CustomIntegrationView[] | null> {
  try {
    const res = await cpFetch(cfg, "/v1/integrations/custom/definitions");
    return ((await res.json()) as { items: CustomIntegrationView[] }).items;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Removes an outside app the user added themselves.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @assistant group:integrations confirm
 */
export async function removeCustomIntegration(
  cfg: ControlPlaneConfig,
  slug: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

/**
 * Saves the secret that finishes setting up an app the user added themselves.
 *
 * Confirmed: outward. It hands a secret to a third-party service Houston then
 * acts against on the user's behalf.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @param values The credential fields the integration asked for, keyed by
 *   field name.
 * @assistant group:integrations confirm hidden: takes a secret; the user pastes the integration's own credential.
 */
export async function submitCustomIntegrationCredential(
  cfg: ControlPlaneConfig,
  slug: string,
  values: Record<string, string>,
): Promise<CustomIntegrationView> {
  const res = await cpFetch(
    cfg,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/credential`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
  return (await res.json()) as CustomIntegrationView;
}

/**
 * Starts the browser sign-in for an app the user added themselves.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @assistant group:integrations hidden: starts a browser sign-in only the user can finish.
 */
export async function startCustomIntegrationOAuth(
  cfg: ControlPlaneConfig,
  slug: string,
): Promise<{ authorizeUrl: string }> {
  const res = await cpFetch(
    cfg,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/oauth/start`,
    { method: "POST" },
  );
  return (await res.json()) as { authorizeUrl: string };
}

/**
 * Checks what kind of service a link the user pasted points to.
 *
 * Confirmed: outward. Houston fetches whatever URL it is handed, so a
 * model-supplied address makes Houston's own network reach a stranger's host.
 * @param url The full https address of the service's API description.
 * @assistant group:integrations confirm
 */
export async function detectCustomIntegration(
  cfg: ControlPlaneConfig,
  url: string,
): Promise<CustomDetectResult> {
  const res = await cpFetch(cfg, "/v1/integrations/custom/detect", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return (await res.json()) as CustomDetectResult;
}

/**
 * Adds an outside app of the user's own from a link.
 * @param input The connector to add: where its API description lives and
 *   how it authenticates.
 * @assistant group:integrations confirm
 * @assistant unschematized: the input's headers is an open record of header name to value.
 */
export async function addCustomIntegration(
  cfg: ControlPlaneConfig,
  input: AddCustomIntegrationInput,
): Promise<CustomIntegrationView> {
  const res = await cpFetch(cfg, "/v1/integrations/custom/definitions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as CustomIntegrationView;
}

/**
 * Lists the actions an app the user added themselves offers.
 *
 * The compiled tools behind one custom integration (the detail card's list).
 * A bare 404 = the host predates the route → null, mirroring
 * `customIntegrations`; a `{code:"not_found"}` 404 is an UNKNOWN SLUG (the
 * definition was removed concurrently) and rethrows as a real failure.
 * @param slug The custom integration's exact slug, from customIntegrations.
 * @assistant group:integrations
 */
export async function customIntegrationTools(
  cfg: ControlPlaneConfig,
  slug: string,
): Promise<CustomToolInfo[] | null> {
  try {
    const res = await cpFetch(
      cfg,
      `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/tools`,
    );
    return ((await res.json()) as { items: CustomToolInfo[] }).items;
  } catch (err) {
    if (
      err instanceof HoustonEngineError &&
      err.status === 404 &&
      (err.body as { code?: string } | null)?.code !== "not_found"
    )
      return null;
    throw err;
  }
}
