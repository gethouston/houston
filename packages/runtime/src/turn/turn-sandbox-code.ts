import type { TurnSandboxDeps } from "./turn-sandbox";
import { TurnGrantExpiredError } from "./turn-sandbox-integrations";
import { fetchWithTurnSignal } from "./turn-sandbox-signal";

/** The facade path `run_code` posts to in turn mode. */
export const TURN_CODE_RUN_PATH = "/sandbox/code/run";

/**
 * Relay one `run_code` call to the gateway, which owns the sandbox URL, its
 * app-layer token and the GCP identity Cloud Run IAM wants. The worker holds
 * none of those: a pooled worker serves another org's turn next, so anything
 * durable it held would outlive the tenant it was granted for.
 *
 * The body is forwarded byte-for-byte (the gateway caps it at 32 MiB) and the
 * upstream status + JSON body come back untouched, so a sandbox-level refusal
 * (a bad language, an oversize body) reaches the model with its real reason
 * instead of a status this layer invented. Only 401 is translated: the gateway
 * saying "not you" about a grant is the same event the integration routes turn
 * into TurnGrantExpiredError, and the facade answers both the same way.
 */
export function makeTurnCodeRoute(
  deps: TurnSandboxDeps,
  fetchImpl: typeof fetch,
) {
  return async (
    body: string,
    signal?: AbortSignal | null,
  ): Promise<Response> => {
    const response = await fetchWithTurnSignal(fetchImpl, signal)(
      `${deps.grant.url}/v1/code/run`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deps.grant.token}`,
        },
        body,
      },
    );
    if (response.status === 401) throw new TurnGrantExpiredError();
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
}
