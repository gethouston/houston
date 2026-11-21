import type { TurnSandboxDeps } from "./turn-sandbox";
import { TurnGrantExpiredError } from "./turn-sandbox-integrations";
import { fetchWithTurnSignal } from "./turn-sandbox-signal";

export const TURN_CODE_RUN_PATH = "/sandbox/code/run";

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
