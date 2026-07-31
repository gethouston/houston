import { Layer } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { FetchHttpClient } from "effect/unstable/http";

/**
 * The deterministic transport seam for the embedded executor (HOU-1083).
 *
 * Effect's HttpClientRequest sets an explicit `content-length` header on every
 * sized body. In a process where more than one fetch/undici implementation is
 * live (pi installs npm undici's fetch + global dispatcher over Node's bundled
 * copy), that explicit header ends up in the wire headers TWICE — once from
 * Effect, once computed by the fetch pipeline — and undici v8's validator
 * rejects the merged "38, 38" value with `UND_ERR_INVALID_ARG: invalid
 * content-length header`. GETs carry no body, so only writes died, on every
 * attempt (observed live on an engine pod, breakpoint on undici
 * lib/core/request.js processHeader).
 *
 * The guard strips the headers a fetch implementation must compute or manage
 * itself; every implementation then derives the single correct value from the
 * body. This holds for ANY combination of Node/Bun/undici versions, so the
 * executor's HTTP behavior stops depending on process-global fetch state.
 */
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

/** Rebuild the init without message-framing / hop-by-hop headers. */
export function sanitizeFetchInit(
  init: RequestInit | undefined,
): RequestInit | undefined {
  if (!init?.headers) return init;
  const headers = new Headers(init.headers);
  for (const name of FORBIDDEN_REQUEST_HEADERS) headers.delete(name);
  return { ...init, headers };
}

/**
 * `globalThis.fetch` resolved at CALL time (pi swaps the global after boot;
 * a captured reference would freeze the wrong implementation), with the
 * forbidden headers stripped from every request.
 */
export const guardedFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, sanitizeFetchInit(init));

/** The executor's HttpClient: Effect's fetch client over `guardedFetch`. */
export function guardedHttpClientLayer(): Layer.Layer<HttpClient.HttpClient> {
  return FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(guardedFetch)),
  );
}
