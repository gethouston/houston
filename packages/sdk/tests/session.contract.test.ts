/**
 * Session / connection contract: attaching a token drives the `connection`
 * view-model, and the token then rides real requests to the host.
 *
 * The `ConnectionViewModel` is one of the cross-platform snapshots a native
 * shell reads, so its exact JSON shape is pinned here.
 */

import { FAKE_TOKEN, type FakeHost } from "@houston/fake-host";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Harness, makeSdk, resetHost, startHost } from "./harness";

let host: FakeHost;

beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host.stop();
});

let h: Harness | undefined;
afterEach(() => {
  h?.sdk.dispose();
  h = undefined;
});

describe("session / connection VM", () => {
  it("publishes a ready connection VM with no token before login", async () => {
    h = makeSdk(host.url);
    await h.sdk.session.whenReady();

    expect(h.sdk.session.getConnection()).toEqual({
      status: "ready",
      baseUrl: host.url,
      hasToken: false,
    });
  });

  it("flips hasToken and persists the token on setToken", async () => {
    h = makeSdk(host.url);
    await h.sdk.session.whenReady();

    await h.sdk.session.setToken(FAKE_TOKEN);

    expect(h.sdk.session.getConnection()).toEqual({
      status: "ready",
      baseUrl: host.url,
      hasToken: true,
    });
    // The token reached the shared store the auth-fetch reads per request.
    expect(h.storage.get("houston.sdk.session.token")).toBe(FAKE_TOKEN);
  });

  it("clears the token (hasToken:false) on setToken(null)", async () => {
    h = makeSdk(host.url);
    await h.sdk.session.setToken(FAKE_TOKEN);
    await h.sdk.session.setToken(null);

    expect(h.sdk.session.getConnection()?.hasToken).toBe(false);
    expect(h.storage.has("houston.sdk.session.token")).toBe(false);
  });

  it("carries the bearer on real requests once set (agents list succeeds)", async () => {
    await resetHost(host.url);
    h = makeSdk(host.url);
    await h.sdk.session.setToken(FAKE_TOKEN);

    // A real authenticated round-trip to the host; no throw = the auth-fetch
    // stamped the header and the request was served.
    await expect(h.sdk.agents.refresh()).resolves.toBeUndefined();
  });
});
