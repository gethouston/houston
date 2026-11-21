import { Layer } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { FetchHttpClient } from "effect/unstable/http";

const FORBIDDEN_REQUEST_HEADERS = [
  "content-length",
  "connection",
  "expect",
  "host",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

const stripForbidden = (headers: Headers): Headers => {
  for (const name of FORBIDDEN_REQUEST_HEADERS) headers.delete(name);
  return headers;
};

export function sanitizeFetchInit(
  init: RequestInit | undefined,
): RequestInit | undefined {
  if (!init?.headers) return init;
  return { ...init, headers: stripForbidden(new Headers(init.headers)) };
}

export const guardedFetch: typeof globalThis.fetch = (input, init) => {
  if (input instanceof Request && !init?.headers) {
    const headers = stripForbidden(new Headers(input.headers));
    return globalThis.fetch(new Request(input, { ...init, headers }));
  }
  return globalThis.fetch(input, sanitizeFetchInit(init));
};

export function guardedHttpClientLayer(): Layer.Layer<HttpClient.HttpClient> {
  return FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(guardedFetch)),
  );
}
