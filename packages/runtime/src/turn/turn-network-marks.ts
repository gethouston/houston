let active: Record<string, number> | undefined;
let ownOrigins: string[] = [];
let unmarkedFetch: typeof fetch | undefined;

export function setActiveTurnTimings(timings: Record<string, number>) {
  active = timings;
}

export function markTurnOnce(name: string) {
  if (active && active[name] === undefined) active[name] = performance.now();
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function untrackedFetch(): typeof fetch {
  return unmarkedFetch ?? globalThis.fetch;
}

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
