/**
 * Preferences contract: key/value preferences round-trip (null clears), and the
 * workspace-locale override persists as the `locale` preference (the gateway
 * stores locale in the same per-user store) — over both the typed facade and the
 * bridge `dispatch` path.
 */

import { type FakeHost, SEED_WORKSPACE_ID } from "@houston/fake-host";
import { PreferencesCommand } from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { type Harness, makeSdk, resetHost, startHost } from "./harness";

let host: FakeHost;

beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host.stop();
});

let h: Harness;
beforeEach(async () => {
  await resetHost(host.url);
  h = makeSdk(host.url);
});
afterEach(() => {
  h.sdk.dispose();
});

describe("preferences", () => {
  it("reads null for an unset key, then round-trips a value", async () => {
    expect(await h.sdk.preferences.get("locale")).toBeNull();

    expect(await h.sdk.preferences.set("locale", "es")).toBe("es");
    expect(await h.sdk.preferences.get("locale")).toBe("es");
  });

  it("clears a preference when set to null", async () => {
    await h.sdk.preferences.set("locale", "es");
    expect(await h.sdk.preferences.set("locale", null)).toBeNull();
    expect(await h.sdk.preferences.get("locale")).toBeNull();
  });

  it("round-trips over the bridge dispatch path", async () => {
    const setRes = await h.sdk.dispatch({
      id: "p1",
      type: PreferencesCommand.Set,
      payload: { key: "timezone", value: "America/New_York" },
    });
    expect(setRes).toEqual({ id: "p1", ok: true, value: "America/New_York" });

    const getRes = await h.sdk.dispatch({
      id: "p2",
      type: PreferencesCommand.Get,
      payload: { key: "timezone" },
    });
    expect(getRes).toEqual({ id: "p2", ok: true, value: "America/New_York" });
  });
});

describe("workspace locale", () => {
  it("PATCHes the workspace and persists as the locale preference", async () => {
    const ws = await h.sdk.preferences.setLocale(SEED_WORKSPACE_ID, "pt");
    expect(ws).toMatchObject({ id: SEED_WORKSPACE_ID, locale: "pt" });
    // Locale is stored in the same per-user preference store.
    expect(await h.sdk.preferences.get("locale")).toBe("pt");
  });

  it("clears the locale override with null", async () => {
    await h.sdk.preferences.setLocale(SEED_WORKSPACE_ID, "pt");
    const ws = await h.sdk.preferences.setLocale(SEED_WORKSPACE_ID, null);
    expect(ws.locale).toBeNull();
    expect(await h.sdk.preferences.get("locale")).toBeNull();
  });
});
