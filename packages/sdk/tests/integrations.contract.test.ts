/**
 * Integrations contract: the `integrations` view-model reflects the gateway's
 * Composio readiness + catalog + connections, degrades to explicit not-ready
 * states (503 → `unavailable`, provider → `signin`) WITHOUT crashing, drives the
 * connect → poll → active flow (both the typed facade and the bridge `dispatch`
 * path).
 *
 * The `IntegrationsViewModel` is a cross-platform snapshot, so its shape is
 * pinned here as API.
 */

import type { FakeHost } from "@houston/fake-host";
import { INTEGRATIONS_SCOPE, type IntegrationsViewModel } from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  control,
  type Harness,
  makeSdk,
  resetHost,
  startHost,
} from "./harness";

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

const vm = (): IntegrationsViewModel | undefined =>
  h.sdk.getSnapshot(INTEGRATIONS_SCOPE) as IntegrationsViewModel | undefined;

describe("integrations VM", () => {
  it("scope key is 'integrations'", () => {
    expect(INTEGRATIONS_SCOPE).toBe("integrations");
  });

  it("loads readiness + catalog + connections into a pinned snapshot", async () => {
    const result = await h.sdk.integrations.refresh();

    expect(result).toEqual({
      loaded: true,
      ready: true,
      // The gateway's discovery catalog grows freely (blocked/unconnected apps
      // are surfaced too), so pin the VM SHAPE and the canonical seeds' presence
      // rather than the exact fixture length.
      toolkits: expect.arrayContaining([
        expect.objectContaining({ slug: "github", name: "GitHub" }),
        expect.objectContaining({ slug: "gmail", name: "Gmail" }),
        expect.objectContaining({ slug: "slack", name: "Slack" }),
      ]),
      connections: [
        { toolkit: "gmail", connectionId: "conn-gmail-0", status: "active" },
      ],
    });
    expect(vm()).toEqual(result);
    // No `reason` key on a ready VM.
    expect("reason" in (vm() as object)).toBe(false);
  });

  it("degrades to {ready:false, reason:'unavailable'} on a 503 (no key)", async () => {
    await control(host.url, "integrations-mode", { mode: "unavailable" });
    await h.sdk.integrations.refresh();

    expect(vm()).toEqual({
      loaded: true,
      ready: false,
      reason: "unavailable",
      toolkits: [],
      connections: [],
    });
  });

  it("surfaces the provider signin state as {ready:false, reason:'signin'}", async () => {
    await control(host.url, "integrations-mode", { mode: "signin" });
    await h.sdk.integrations.refresh();

    expect(vm()).toMatchObject({
      loaded: true,
      ready: false,
      reason: "signin",
      toolkits: [],
      connections: [],
    });
  });

  it("connect → poll pending → activate → poll active", async () => {
    const { redirectUrl, connectionId } =
      await h.sdk.integrations.connect("slack");
    expect(redirectUrl).toBe("https://connect.test/slack");
    expect(connectionId).toMatch(/^conn-slack-/);

    expect(await h.sdk.integrations.pollConnection(connectionId)).toEqual({
      toolkit: "slack",
      connectionId,
      status: "pending",
    });

    await control(host.url, "integrations-activate", { connectionId });
    expect(await h.sdk.integrations.pollConnection(connectionId)).toEqual({
      toolkit: "slack",
      connectionId,
      status: "active",
    });
  });

  it("disconnect removes the toolkit's connections and refetches the VM", async () => {
    const result = await h.sdk.integrations.disconnect("gmail");
    expect(result.connections).toEqual([]);
    expect(vm()?.connections).toEqual([]);
  });
});
