/**
 * Staging experiment: stamp provider network milestones onto the running
 * turn's timings, so a far-away worker's first-token delay splits into
 * session setup, connection setup and the provider's first byte. A single-use
 * worker runs exactly one turn, so one active record is exact there; a
 * multi-turn worker never installs this.
 */

let active: Record<string, number> | undefined;
let ownOrigins: string[] = [];
let unmarkedFetch: typeof fetch | undefined;

export function setActiveTurnTimings(timings: Record<string, number>) {
  active = timings;
}

/** First occurrence wins; later calls are free no-ops. */
export function markTurnOnce(name: string) {
  if (active && active[name] === undefined) active[name] = performance.now();
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The global fetch without the marks: a request that is not the turn's own
 *  (a prewarm's) rides the same connection pool and stamps nothing. */
export function untrackedFetch(): typeof fetch {
  return unmarkedFetch ?? globalThis.fetch;
}

/** Wrap fetch and WebSocket once. Calls to Houston's own origins are not
 *  provider traffic and are left unmarked. */
export function installTurnNetworkMarks(houstonOrigins: string[]) {
  ownOrigins = houstonOrigins.flatMap((value) => {
    try {
      return [new URL(value).origin];
    } catch {
      return [];
    }
  });
  const realFetch = globalThis.fetch;
  unmarkedFetch = realFetch;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (ownOrigins.some((origin) => url.startsWith(origin))) {
      return realFetch(input, init);
    }
    markTurnOnce("t_provider_fetch_start");
    const response = await realFetch(input, init);
    markTurnOnce("t_provider_fetch_headers");
    return response;
  };
  const RealWebSocket = globalThis.WebSocket;
  if (!RealWebSocket) return;
  globalThis.WebSocket = class extends RealWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      markTurnOnce("t_provider_ws_start");
      this.addEventListener("open", () => markTurnOnce("t_provider_ws_open"), {
        once: true,
      });
      this.addEventListener(
        "message",
        () => markTurnOnce("t_provider_ws_first_message"),
        { once: true },
      );
    }
  };
}
