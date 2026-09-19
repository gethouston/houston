import type { SandboxFetch } from "./sandbox-fetch";

/**
 * The ONE network hop `run_code` makes, behind an interface, because the two
 * deployments that make it hold completely different authority:
 *
 * - server mode / self-host reaches the Cloud Run sandbox DIRECTLY, so this
 *   process holds the sandbox URL, the app-layer token and (in GCP) a
 *   Google-signed ID token for Cloud Run IAM;
 * - a pooled stateless turn worker holds NONE of those. It reaches the sandbox
 *   through the turn's own grant — the gateway relays `/v1/code/run` exactly
 *   the way it relays integrations — so a worker that serves another org's
 *   turn next has nothing durable to leak.
 *
 * Both return the upstream `Response` unread: status mapping and the artifact
 * write-back are the tool's job, identical on either transport.
 */

/** The code-sandbox RunRequest as the tool sends it (wire shape, verbatim). */
export interface RunCodeRequest {
  language: string;
  code: string;
  files: { path: string; contentBase64: string }[];
  /** Absent = the sandbox's own default timeout. */
  timeoutMs?: number;
}

export type RunCodeTransport = (
  body: RunCodeRequest,
  signal: AbortSignal | undefined,
) => Promise<Response>;

export interface DirectRunCodeTransportOptions {
  baseUrl: string;
  token: string;
  /** Google-signed ID token for Cloud Run IAM; null on dev machines. */
  idToken?: () => Promise<string | null>;
}

/**
 * Direct HTTP to the code sandbox. Two auth layers ride two headers:
 * `Authorization` carries the Google-signed ID token for Cloud Run IAM
 * (--no-allow-unauthenticated), `X-Sandbox-Token` carries the app-layer shared
 * secret. They MUST be separate headers — IAM consumes Authorization, so an app
 * token there would break under IAM.
 */
export function directRunCodeTransport(
  opts: DirectRunCodeTransportOptions,
): RunCodeTransport {
  // `baseUrl` may carry a trailing slash from config; strip it to avoid `//run`.
  const base = opts.baseUrl.replace(/\/$/, "");
  return async (body, signal) => {
    const idToken = opts.idToken ? await opts.idToken() : null;
    return fetch(`${base}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { "x-sandbox-token": opts.token } : {}),
        ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  };
}

/**
 * Turn mode: the run request goes to this turn's sandbox facade, which forwards
 * it to the gateway under the grant. No URL, no token, no GCP identity here.
 */
export function sandboxFetchRunCodeTransport(opts: {
  call: SandboxFetch;
  path: string;
}): RunCodeTransport {
  return (body, signal) =>
    opts.call(opts.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
}
