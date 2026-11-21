const NO_AUTH_REPLAY: unique symbol = Symbol.for("houston.sdk.noAuthReplay");

const REQUEST_GUARD: unique symbol = Symbol.for("houston.sdk.requestGuard");
type Marked = RequestInit & {
  [NO_AUTH_REPLAY]?: true;
  [REQUEST_GUARD]?: () => void;
};

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

export function assertRequestIdentity(init: RequestInit | undefined): void {
  const marked: Marked | undefined = init;
  marked?.[REQUEST_GUARD]?.();
}

export function refusesAuthReplay(init: RequestInit | undefined): boolean {
  const marked: Marked | undefined = init;
  return marked?.[NO_AUTH_REPLAY] === true;
}

export function fetchWithoutAuthReplay(inner: typeof fetch): typeof fetch {
  return (input, init) => inner(input, withoutAuthReplay(init));
}
