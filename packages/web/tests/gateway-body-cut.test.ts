import { gatewayAuthFetch } from "@houston/engine-adapter/control-plane";
import { isNetworkTransportError } from "@houston/engine-adapter/network-transport-error";
import { afterEach, expect, test, vi } from "vitest";

/**
 * WebKit rejects `Response.json()` with a DOMException `SyntaxError` ("The
 * string did not match the expected pattern.") when the gateway connection
 * drops mid-body (HOUSTON-APP-5BD, -5F0, -5CD). The gateway transport must
 * hand that back as connectivity, and leave any other decode failure alone.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function answerWith(json: () => Promise<unknown>) {
  globalThis.fetch = vi.fn(async () => {
    const res = new Response("{}", { status: 200 });
    res.json = json;
    return res;
  }) as unknown as typeof fetch;
}

test("a WebKit body cut on json() reads as a transport failure", async () => {
  answerWith(() =>
    Promise.reject(
      new DOMException(
        "The string did not match the expected pattern.",
        "SyntaxError",
      ),
    ),
  );
  const res = await gatewayAuthFetch("t")("https://gw.example/v1/x");

  const err = await res.json().then(
    () => null,
    (e: unknown) => e,
  );

  expect(err).toBeInstanceOf(TypeError);
  expect(isNetworkTransportError(err)).toBe(true);
});

test("a body that is genuinely not JSON still fails loudly", async () => {
  globalThis.fetch = vi.fn(
    async () => new Response("<html>", { status: 200 }),
  ) as unknown as typeof fetch;
  const res = await gatewayAuthFetch("t")("https://gw.example/v1/x");

  const err = await res.json().then(
    () => null,
    (e: unknown) => e,
  );

  expect(err).toBeInstanceOf(SyntaxError);
  expect(isNetworkTransportError(err)).toBe(false);
});

test("a decoded body passes through unchanged", async () => {
  globalThis.fetch = vi.fn(
    async () => new Response('{"items":[1]}', { status: 200 }),
  ) as unknown as typeof fetch;
  const res = await gatewayAuthFetch("t")("https://gw.example/v1/x");

  expect(await res.json()).toEqual({ items: [1] });
});
