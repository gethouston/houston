import { expect, vi } from "vitest";

export interface Call {
  url: string;
  method: string;
  body: string | null;
  form: FormData | null;
  signal: AbortSignal | null;
  headers: Headers;
}

export const ORG = "abcdef0123456789";

export function installLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

export const json = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function expectGatewayHeaders(call: Call): void {
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
}

export interface WireCapture {
  calls: Call[];
  reset(): void;
  restore(): void;
  stubFetch(make: () => Response): void;
  stubResponses(...responses: Response[]): void;
  stubRouted(respond: (call: Call) => Response | Promise<Response>): void;
}

export function createWireCapture(): WireCapture {
  const realFetch = globalThis.fetch;
  const calls: Call[] = [];

  const record = (input: unknown, init?: RequestInit): Call => {
    const call: Call = {
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      form: init?.body instanceof FormData ? init.body : null,
      signal: init?.signal ?? null,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return call;
  };

  const stubRouted = (
    respond: (call: Call) => Response | Promise<Response>,
  ): void => {
    globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) =>
      respond(record(input, init)),
    ) as unknown as typeof fetch;
  };

  return {
    calls,
    reset: () => {
      calls.length = 0;
    },
    restore: () => {
      globalThis.fetch = realFetch;
    },
    stubFetch: (make) => stubRouted(() => make()),
    stubResponses: (...responses) =>
      stubRouted(() => {
        const next = responses.shift();
        if (!next) throw new Error("stubFetch: no responses left");
        return next;
      }),
    stubRouted,
  };
}
