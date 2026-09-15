/**
 * The wire harness the `wire-*.test.ts` specs share.
 *
 * Those specs pin what the web adapter puts on the wire BYTE for byte — the
 * whole URL, the method, the body, and the headers the hosted gateway routes on
 * — because the control-plane copies they replaced are gone and nothing else in
 * the suite would notice a delegated call drifting. Everything generic to that
 * job lives here; a spec keeps only its own routes and payloads.
 */

import { expect, vi } from "vitest";

/** One recorded request, exactly as the adapter issued it. */
export interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

/** The active space every hosted spec pins. The gateway wants `[a-f0-9]{16}`. */
export const ORG = "abcdef0123456789";

/**
 * An in-memory `localStorage`. The client reads the session token and the last
 * selected agent through it, and jsdom is not loaded for these specs.
 */
export function installLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

/** A JSON response, the shape the gateway answers with. */
export const json = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** The three headers the hosted gateway routes on. */
export function expectGatewayHeaders(call: Call): void {
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
}

/**
 * The recording `fetch` stub. `calls` is a stable array a spec reads its
 * assertions off; `reset` empties it in place between tests and `restore` puts
 * the real `fetch` back.
 */
export interface WireCapture {
  calls: Call[];
  reset(): void;
  restore(): void;
  /** Answer every request with `make()`. */
  stubFetch(make: () => Response): void;
  /** Answer the requests in order, one queued response each. */
  stubResponses(...responses: Response[]): void;
  /** Answer from the recorded call itself (route on its path or method). */
  stubRouted(respond: (call: Call) => Response): void;
}

/** Create the harness. Call it at a spec's top level, before anything stubs. */
export function createWireCapture(): WireCapture {
  const realFetch = globalThis.fetch;
  const calls: Call[] = [];

  const record = (input: unknown, init?: RequestInit): Call => {
    const call: Call = {
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return call;
  };

  const stubRouted = (respond: (call: Call) => Response): void => {
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
