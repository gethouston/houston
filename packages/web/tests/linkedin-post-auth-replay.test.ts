import { HoustonClient } from "@houston/engine-adapter/client";
import { resetRejectedBearers } from "@houston/engine-adapter/cp/bearer-recovery";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The transport answers a 401 by refreshing the session and replaying with
 * the bearer current then. A LinkedIn post is replayed only for the same
 * person: by the time its 401 lands, someone else may be signed in, and a
 * replay as them would post the first person's picture on their LinkedIn.
 */

const BASE = "http://host";
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const { calls, reset, restore, stubRouted } = createWireCapture();
const engine = { baseUrl: BASE, token: "bearer-ada" };

beforeEach(() => {
  installLocalStorage();
  reset();
  engine.token = "bearer-ada";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_ENGINE__: engine,
      // Grace signed in meanwhile: the refresh answers her bearer.
      __HOUSTON_SESSION_REFRESH__: async () => engine.token,
      __HOUSTON_CP__: true,
    },
  });
});

afterEach(() => {
  restore();
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  resetRejectedBearers();
  vi.clearAllMocks();
});

function client() {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** The first request is refused once the account switched; the rest land. */
function refuseAcrossSwitch() {
  stubRouted(async () => {
    if (calls.length > 1) return json(200, { connected: false });
    engine.token = "bearer-grace";
    return json(401, { error: "token expired" });
  });
}

const bearers = () => calls.map((c) => c.headers.get("Authorization"));

test("a post refused after an account switch is sent once, as its own person", async () => {
  refuseAcrossSwitch();
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], {
    type: "image/png",
  });
  await expect(
    client().postLinkedInImage({ image: png, text: "Hi" }),
  ).resolves.toEqual({ kind: "refused", code: "signed_out" });
  expect(bearers()).toEqual(["Bearer bearer-ada"]);
});

// The same 401 on any other request still heals by replaying.
test("a read refused the same way is replayed with the refreshed bearer", async () => {
  refuseAcrossSwitch();
  await client().linkedInConnection();
  expect(bearers()).toEqual(["Bearer bearer-ada", "Bearer bearer-grace"]);
});

// With no bearer at send time the transport would wait for a refresh, and
// whoever is signed in when it lands would own the post.
test("a post with no bearer is refused without waiting for a refresh", async () => {
  engine.token = "";
  const refresh = vi.fn(async () => "bearer-grace");
  (
    globalThis as unknown as { window: Record<string, unknown> }
  ).window.__HOUSTON_SESSION_REFRESH__ = refresh;
  stubRouted(async () => json(201, {}));
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], {
    type: "image/png",
  });
  await expect(
    client().postLinkedInImage({ image: png, text: "Hi" }),
  ).resolves.toEqual({ kind: "refused", code: "signed_out" });
  expect(calls).toHaveLength(0);
  expect(refresh).not.toHaveBeenCalled();
});

const jwtFor = (sub: string, n: number) =>
  `h.${btoa(JSON.stringify({ sub, n })).replace(/=+$/, "")}.s`;

// A token gone stale while the laptop slept heals: the refreshed bearer names
// the same person, so the post goes out once more, as them.
test("a post refused for a stale token of the same person is replayed once", async () => {
  engine.token = jwtFor("ada", 1);
  stubRouted(async () => {
    if (calls.length > 1) return json(201, {});
    engine.token = jwtFor("ada", 2);
    return json(401, { error: "token expired" });
  });
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], {
    type: "image/png",
  });
  await expect(
    client().postLinkedInImage({ image: png, text: "Hi" }),
  ).resolves.toMatchObject({ kind: "posted" });
  expect(bearers()).toEqual([
    `Bearer ${jwtFor("ada", 1)}`,
    `Bearer ${jwtFor("ada", 2)}`,
  ]);
});

test("a post refused when the refresh names someone else is not replayed", async () => {
  engine.token = jwtFor("ada", 1);
  stubRouted(async () => {
    engine.token = jwtFor("grace", 1);
    return json(401, { error: "token expired" });
  });
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], {
    type: "image/png",
  });
  await expect(
    client().postLinkedInImage({ image: png, text: "Hi" }),
  ).resolves.toEqual({ kind: "refused", code: "signed_out" });
  expect(bearers()).toEqual([`Bearer ${jwtFor("ada", 1)}`]);
});
