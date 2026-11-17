import { HoustonClient } from "@houston/engine-adapter/client";
import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
  stubRouted((call) =>
    call.url.endsWith("/events")
      ? new Response("", { status: 200 })
      : json(200, { ok: true }),
  );
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

test.each([
  ["c1", undefined, undefined],
  ["c2", ["createAgent"] as const, ["createAgent"]],
])(
  "a user message sends grants %j in its body",
  async (sessionKey, grants, expected) => {
    const client = new HoustonClient({
      baseUrl: "http://host",
      token: "t",
      controlPlane: true,
    });
    client.setActiveOrg(ORG);
    await client.startSession("a1", {
      sessionKey,
      prompt: "Please hire someone",
      ...(grants ? { grants: [...grants] } : {}),
    });
    const sent = await vi.waitUntil(() =>
      calls.find(
        (call) => call.method === "POST" && call.url.endsWith("/messages"),
      ),
    );
    expect(sent.url).toBe(
      `http://host/agents/a1/conversations/${sessionKey}/messages`,
    );
    expectGatewayHeaders(sent);
    const body = JSON.parse(sent.body ?? "{}");
    expect(typeof body.nonce).toBe("string");
    expect(body).toEqual({
      text: "Please hire someone",
      nonce: body.nonce,
      ...(expected ? { grants: expected } : {}),
    });
  },
);

test("a hidden coordinator kickoff carries the person's one-use hire grant", async () => {
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  const prompt = `${AUTO_CONTINUE_MARKER}\n\nStart the goal.`;
  await client.startSession("a1", {
    sessionKey: "hidden-goal",
    prompt,
    grants: ["createAgent"],
  });
  const sent = await vi.waitUntil(() =>
    calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/messages"),
    ),
  );
  const body = JSON.parse(sent.body ?? "{}");
  expect(body).toEqual({
    text: prompt,
    nonce: body.nonce,
    grants: ["createAgent"],
  });
  expectGatewayHeaders(sent);
});
