const NO_AUTH_REPLAY: unique symbol = Symbol.for("houston.sdk.noAuthReplay");

const REQUEST_GUARD: unique symbol = Symbol.for("houston.sdk.requestGuard");
type Marked = RequestInit & {
  [NO_AUTH_REPLAY]?: true;
  [REQUEST_GUARD]?: () => void;
};

/** `init` marked so it never goes out under another person's bearer. */
export function withoutAuthReplay(
  init: RequestInit | undefined,
  guard?: () => void,
): RequestInit {
  const marked: Marked = {
    ...init,
    [NO_AUTH_REPLAY]: true,
    [REQUEST_GUARD]: guard,
  };
  return marked;
}

/** Check the initiating identity again before each transport retry. */
export function assertRequestIdentity(init: RequestInit | undefined): void {
  const marked: Marked | undefined = init;
  marked?.[REQUEST_GUARD]?.();
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
