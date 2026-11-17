// The "is this failure just connectivity?" classifier for the error-surfacing
// layer. Dependency-free (one SDK subpath) so it is node-testable directly
// (app/tests/network-transport-error.test.ts) and importable from anywhere.
// Lives in the engine adapter for the same reason as ./engine-waking-error.ts:
// the adapter ships in the desktop bundle, which cannot resolve `@houston/app`.
// app/src/lib/network-transport-error.ts re-exports it.
//
// Distinct from `isTransientEngineError` (the retry classifier): that one asks
// "worth another attempt?" and matches ANY TypeError. This one gates the
// bug-report surface (red toast + Sentry), so it must NEVER match a coding-bug
// TypeError ("undefined is not a function") — it keys on the small fixed set of
// messages browsers use for fetch transport failures.

// The message set lives in the SDK (`@houston/sdk/transport-failure`), which
// types an interrupted upload off the same predicate.
import { isTransportFailure } from "@houston/sdk/transport-failure";

/**
 * A transport-level network failure: the device is offline, the host is
 * unreachable, or the connection dropped before or while the answer arrived.
 * A match does not prove the server never acted on the request, so it must
 * not justify replaying a non-idempotent one. Browsers report
 * every such failure as a `TypeError` with an engine-specific message
 * (HOU-1085: a sleep-wake burst fails every live gateway query at once with
 * WebKit's "Load failed"). These are an expected, explainable environment
 * state — surfaced as a connectivity toast, never the red bug pair + Sentry.
 *
 * A wrapper that kept the thrown transport error as its standard `cause` is
 * the same failure: one level of `cause` is unwrapped, never more, so a
 * wrapper chain cannot loop and a coding-bug wrapper stays a bug.
 */
export function isNetworkTransportError(err: unknown): boolean {
  return (
    isTransportTypeError(err) ||
    (err instanceof Error && isTransportTypeError(err.cause))
  );
}

function isTransportTypeError(err: unknown): boolean {
  return isTransportFailure(err);
}
