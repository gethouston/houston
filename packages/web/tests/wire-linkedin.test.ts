import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * Posting to LinkedIn rides `sdk.linkedin`. Pinned literally: the whole URL,
 * the method, the body (JSON, or the multipart parts) and the headers the
 * gateway routes on. A multipart body carries its own Content-Type (with
 * the boundary), so the JSON one every other gateway call stamps is absent
 * from the post.
 */

const BASE = "http://host";
const AUTHORIZE =
  "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=c&redirect_uri=https%3A%2F%2Fgateway.gethouston.ai%2Fv1%2Flinkedin%2Foauth%2Fcallback&state=s&scope=openid%20profile%20w_member_social";
const POSTED = {
  postUrn: "urn:li:share:7",
  postUrl: "https://www.linkedin.com/feed/update/urn:li:share:7/",
};

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

function client(controlPlane = true) {
  const c = new HoustonClient({ baseUrl: BASE, token: "t", controlPlane });
  c.setActiveOrg(ORG);
  return c;
}

function only(): Call {
  expect(calls).toHaveLength(1);
  return calls[0];
}

function expectGatewayHeaders(call: Call, contentType: string | null) {
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
  expect(call.headers.get("Content-Type")).toBe(contentType);
}

const png = (...bytes: number[]) =>
  new Blob([new Uint8Array([137, 80, 78, 71, ...bytes])], {
    type: "image/png",
  });

describe("linkedin connection", () => {
  test("GET /v1/linkedin/connection reads who is connected", async () => {
    const answer = {
      connected: true,
      name: "Daniel Vélez",
      expiresAt: "2026-12-16T00:00:00Z",
    };
    stubRouted(() => json(200, answer));
    await expect(client().linkedInConnection()).resolves.toEqual(answer);
    const call = only();
    expect(call.url).toBe(`${BASE}/v1/linkedin/connection`);
    expect(call.method).toBe("GET");
    expect(call.body).toBeNull();
    expectGatewayHeaders(call, "application/json");
  });

  test("POST /v1/linkedin/connect sends {} from the web and answers the authorization page", async () => {
    stubRouted(() => json(200, { authorizeUrl: AUTHORIZE }));
    await expect(client().connectLinkedIn()).resolves.toEqual({
      url: AUTHORIZE,
      accepted: null,
    });
    const call = only();
    expect(call.url).toBe(`${BASE}/v1/linkedin/connect`);
    expect(call.method).toBe("POST");
    expect(call.body).toBe("{}");
    expectGatewayHeaders(call, "application/json");
  });

  test("POST /v1/linkedin/connect names the desktop's loopback return", async () => {
    stubRouted(() => json(200, { authorizeUrl: AUTHORIZE }));
    const state = "q9X-_3abcDEF4567";
    await expect(
      client().connectLinkedIn({ kind: "loopback", port: 50123, state }),
    ).resolves.toEqual({ url: AUTHORIZE, accepted: "loopback" });
    expect(only().body).toBe(
      `{"return":"loopback","port":50123,"state":"${state}"}`,
    );
  });

  test("POST /v1/linkedin/connect/complete redeems the ticket", async () => {
    const connection = {
      connected: true,
      name: "Daniel Vélez",
      expiresAt: "2026-12-16T00:00:00Z",
    };
    stubRouted(() => json(200, connection));
    await expect(
      client().completeLinkedIn("Tk7-ticket.value_~9"),
    ).resolves.toEqual({ kind: "connected", connection });
    const call = only();
    expect(call.url).toBe(`${BASE}/v1/linkedin/connect/complete`);
    expect(call.method).toBe("POST");
    expect(call.body).toBe('{"ticket":"Tk7-ticket.value_~9"}');
    expectGatewayHeaders(call, "application/json");
  });

  test("a spent or foreign ticket is invalid, and a mangled one is never sent", async () => {
    stubRouted(() => json(404, { code: "invalid", error: "x" }));
    await expect(client().completeLinkedIn("Tk7-ticket")).resolves.toEqual({
      kind: "invalid",
    });
    await expect(client().completeLinkedIn("no spaces!")).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  test("DELETE /v1/linkedin/connection disconnects", async () => {
    stubRouted(() => new Response(null, { status: 204 }));
    await expect(client().disconnectLinkedIn()).resolves.toBeUndefined();
    const call = only();
    expect(call.url).toBe(`${BASE}/v1/linkedin/connection`);
    expect(call.method).toBe("DELETE");
    expect(call.body).toBeNull();
    expectGatewayHeaders(call, "application/json");
  });

  test("a deployment with no LinkedIn key throws its 503 as the engine error", async () => {
    stubRouted(() =>
      json(503, { code: "not_configured", error: "LinkedIn is not set up" }),
    );
    await expect(client().linkedInConnection()).rejects.toMatchObject({
      name: "HoustonEngineError",
      status: 503,
      body: { code: "not_configured" },
    });
  });

  test("off the gateway nothing is asked", async () => {
    stubRouted(() => json(200, { connected: false }));
    await expect(client(false).linkedInConnection()).rejects.toMatchObject({
      status: 501,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("linkedin post", () => {
  test("POST /v1/linkedin/posts sends multipart {image, text, altText}", async () => {
    stubRouted(() => json(201, POSTED));
    await expect(
      client().postLinkedInImage({
        image: png(1, 2),
        text: "Meet our team.\n\ngethouston.ai\n",
        altText: "Org chart of Acme",
      }),
    ).resolves.toEqual({ kind: "posted", ...POSTED });
    const call = only();
    expect(call.url).toBe(`${BASE}/v1/linkedin/posts`);
    expect(call.method).toBe("POST");
    expect(call.body).toBeNull();
    expectGatewayHeaders(call, null);
    const form = call.form as FormData;
    expect([...form.keys()]).toEqual(["image", "text", "altText"]);
    expect(form.get("text")).toBe("Meet our team.\n\ngethouston.ai");
    expect(form.get("altText")).toBe("Org chart of Acme");
    const image = form.get("image") as File;
    expect(image.name).toBe("org-chart.png");
    expect(image.type).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71, 1, 2]),
    );
  });

  test("sends {image, text} alone with no alt text", async () => {
    stubRouted(() => json(201, POSTED));
    await client().postLinkedInImage({ image: png(), text: "Hi" });
    expect([...(only().form as FormData).keys()]).toEqual(["image", "text"]);
  });

  test("types a refusal, Retry-After included", async () => {
    stubRouted(
      () =>
        new Response(JSON.stringify({ code: "rate_limited", error: "x" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        }),
    );
    await expect(
      client().postLinkedInImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({
      kind: "refused",
      code: "rate_limited",
      retryAfterMs: 60_000,
    });
  });

  test("types a lapsed LinkedIn connection", async () => {
    stubRouted(() =>
      json(409, { code: "linkedin_not_connected", error: "Connect again" }),
    );
    await expect(
      client().postLinkedInImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "refused", code: "linkedin_not_connected" });
  });

  test("off the gateway a post is refused without a request", async () => {
    stubRouted(() => json(201, POSTED));
    await expect(
      client(false).postLinkedInImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "refused", code: "not_configured" });
    expect(calls).toHaveLength(0);
  });
});
