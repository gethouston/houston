import type { SandboxFetch } from "./sandbox-fetch";

export interface RunCodeRequest {
  language: string;
  code: string;
  files: { path: string; contentBase64: string }[];
  timeoutMs?: number;
}

export type RunCodeTransport = (
  body: RunCodeRequest,
  signal: AbortSignal | undefined,
) => Promise<Response>;

export interface DirectRunCodeTransportOptions {
  baseUrl: string;
  token: string;
  idToken?: () => Promise<string | null>;
}

export function directRunCodeTransport(
  opts: DirectRunCodeTransportOptions,
): RunCodeTransport {
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
