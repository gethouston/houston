import { gatewayAuthFetch } from "@houston/engine-adapter/control-plane";
import { isNetworkTransportError } from "@houston/engine-adapter/network-transport-error";
import { afterEach, expect, test, vi } from "vitest";

/**
 * A gateway response's `json()` reads the text, then parses it. WebKit's own
 * `Response.json()` rejects every unparseable body (an HTML page, an empty
 * 200, a 204) with one generic DOMException ("The string did not match the
 * expected pattern."), so it can tell neither a dropped stream from a gateway
 * bug nor one bad body from another (HOUSTON-APP-5BD, -5F0, -5CD). Read as
 * text, a stream that drops mid-body rejects with the engine's transport
 * `TypeError`, which is connectivity, and a body that is not JSON fails as a
 * `SyntaxError` naming the status, content type and length.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function answer(make: () => Response) {
  globalThis.fetch = vi.fn(async () => make()) as unknown as typeof fetch;
}

async function jsonError(): Promise<unknown> {
  const res = await gatewayAuthFetch("t")("https://gw.example/v1/x");
  return res.json().then(
    () => null,
    (e: unknown) => e,
  );
}

test("a stream WebKit drops mid-body reads as a transport failure", async () => {
  answer(() => {
    const res = new Response('{"items":[1', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    res.text = () => Promise.reject(new TypeError("Load failed"));
    // WebKit's json() for the same response: the generic DOMException.
    res.json = () =>
      Promise.reject(
        new DOMException(
          "The string did not match the expected pattern.",
          "SyntaxError",
        ),
      );
    return res;
  });

  const err = await jsonError();

  expect(err).toBeInstanceOf(TypeError);
  expect(isNetworkTransportError(err)).toBe(true);
});

test("an HTML page fails loudly with what the gateway answered", async () => {
  answer(
    () =>
      new Response("<html>bad gateway</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  );

  const err = await jsonError();

  expect(err).toBeInstanceOf(SyntaxError);
  expect(isNetworkTransportError(err)).toBe(false);
  expect((err as Error).message).toContain("200");
  expect((err as Error).message).toContain("text/html");
  expect((err as Error).message).toContain("24 chars");
});

test("WebKit's generic json() rejection on an HTML page is never connectivity", async () => {
  answer(() => {
    const res = new Response("<html>bad gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    res.json = () =>
      Promise.reject(
        new DOMException(
          "The string did not match the expected pattern.",
          "SyntaxError",
        ),
      );
    return res;
  });

  const err = await jsonError();

  expect(isNetworkTransportError(err)).toBe(false);
  expect((err as Error).message).toContain("text/html");
});

test("the failure carries nothing of the body, in message, stack or cause", async () => {
  // V8's JSON.parse message quotes the input ("hello secret" is not valid
  // JSON), and a reported error ships message, stack and cause chain.
  answer(
    () =>
      new Response("hello secret", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
  );

  const err = await jsonError();

  expect(err).toBeInstanceOf(SyntaxError);
  expect((err as Error).message).toBe(
    "gateway answered 200 (text/plain, 12 chars) that is not JSON",
  );
  for (let e: unknown = err; e !== undefined; e = (e as Error).cause) {
    expect(e).toBeInstanceOf(Error);
    expect(String((e as Error).message)).not.toContain("secret");
    expect(String((e as Error).stack)).not.toContain("secret");
  }
  expect((err as Error).cause).toBeUndefined();
});

test("an empty 200 fails loudly, never as connectivity", async () => {
  answer(() => new Response("", { status: 200 }));

  const err = await jsonError();

  expect(err).toBeInstanceOf(SyntaxError);
  expect(isNetworkTransportError(err)).toBe(false);
  expect((err as Error).message).toContain("0 chars");
});

test("a JSON body that ends early still fails loudly", async () => {
  // Only `text()` rejecting means the stream dropped: a body that arrived
  // whole but short is the gateway's, and stays a reported failure.
  answer(
    () =>
      new Response('{"items":[1', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  const err = await jsonError();

  expect(err).toBeInstanceOf(SyntaxError);
  expect(isNetworkTransportError(err)).toBe(false);
});

test("a decoded body passes through unchanged", async () => {
  answer(() => new Response('{"items":[1]}', { status: 200 }));
  const res = await gatewayAuthFetch("t")("https://gw.example/v1/x");

  expect(await res.json()).toEqual({ items: [1] });
});
