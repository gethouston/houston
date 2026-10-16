/**
 * A request the transport must never send again under a refreshed bearer.
 *
 * The hosted transport answers a 401 by refreshing the session and replaying
 * the request with whatever bearer is current then (`@houston/engine-adapter`
 * `cp/bearer-recovery.ts`). For most requests that heals an expired token. For
 * one that acts in the person's name somewhere else (a LinkedIn post), the
 * current bearer may belong to someone who signed in since, and the replay
 * would act as them. Such a request carries this mark: it is replayed only
 * when the refreshed bearer names the same person, and never sent while there
 * is no bearer at all.
 *
 * The mark rides the `RequestInit` as a symbol key, so it never reaches the
 * wire: object spreads copy it and `fetch` ignores it. Dependency-free: the
 * adapter reads it through the `@houston/sdk/auth-replay` subpath.
 */

const NO_AUTH_REPLAY: unique symbol = Symbol.for("houston.sdk.noAuthReplay");

type Marked = RequestInit & { [NO_AUTH_REPLAY]?: true };

/** `init` marked so it never goes out under another person's bearer. */
export function withoutAuthReplay(init: RequestInit | undefined): RequestInit {
  const marked: Marked = { ...init, [NO_AUTH_REPLAY]: true };
  return marked;
}

/** Whether `init` was marked by {@link withoutAuthReplay}. */
export function refusesAuthReplay(init: RequestInit | undefined): boolean {
  const marked: Marked | undefined = init;
  return marked?.[NO_AUTH_REPLAY] === true;
}

/** A transport whose every request carries the mark. */
export function fetchWithoutAuthReplay(inner: typeof fetch): typeof fetch {
  return (input, init) => inner(input, withoutAuthReplay(init));
}
