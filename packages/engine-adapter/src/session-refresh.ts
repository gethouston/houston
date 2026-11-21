declare global {
  interface Window {
    __HOUSTON_SESSION_REFRESH__?: () => Promise<string | null>;
  }
}

let inflight: Promise<string | null> | null = null;

const isTransientRefreshFailure = (err: unknown): boolean => {
  if (err instanceof TypeError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === "network" || code === "auth/network-request-failed";
};

export function hasSessionRefresher(): boolean {
  return typeof window !== "undefined" && !!window.__HOUSTON_SESSION_REFRESH__;
}

export function refreshLiveToken(): Promise<string | null> {
  const refresh =
    typeof window !== "undefined"
      ? window.__HOUSTON_SESSION_REFRESH__
      : undefined;
  if (!refresh) return Promise.resolve(null);
  if (!inflight) {
    inflight = refresh()
      .catch((err: unknown) => {
        if (isTransientRefreshFailure(err)) {
          throw new TypeError("Load failed (session refresh)", { cause: err });
        }
        console.warn("[session-refresh] terminal refresh failure:", err);
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
