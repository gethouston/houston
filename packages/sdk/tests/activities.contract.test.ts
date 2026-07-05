/**
 * Activities contract: the `activities/<agentId>` view-model reflects the host's
 * `GET /agents/:id/activities`, the CRUD facade mutates then refetches so the
 * snapshot always reflects the server, and a change made by ANOTHER client (an
 * out-of-band `ActivityChanged` on `/v1/events`) live-updates the snapshot.
 *
 * The `ActivitiesViewModel` is a cross-platform snapshot (the board/missions the
 * iOS app renders), so its seed shape is pinned here as API.
 */

import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import {
  type ActivitiesViewModel,
  activitiesScope,
  type CreatedActivity,
} from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { type Harness, makeSdk, resetHost, startHost, until } from "./harness";

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

const ISO = new Date(Date.UTC(2024, 0, 1)).toISOString();
const scope = activitiesScope(SEED_AGENT_ID);
const vm = (): ActivitiesViewModel | undefined =>
  h.sdk.getSnapshot(scope) as ActivitiesViewModel | undefined;

describe("activities VM", () => {
  it("loads the seed activities into a pinned snapshot shape", async () => {
    await h.sdk.activities.refresh(SEED_AGENT_ID);
    // The reactivity stream's onConnect fires a concurrent background refetch,
    // which briefly republishes a `loaded:false` catch-up snapshot; wait for it
    // to settle so the pinned shape is read once the list is stable.
    await until(() => vm()?.loaded === true, "activities loaded");

    expect(vm()).toEqual({
      loaded: true,
      items: [
        {
          id: "act-1",
          title: "Plan a trip to Tokyo",
          description: "Research flights and hotels for the spring",
          status: "needs_you",
          updatedAt: ISO,
          // No explicit session_key on the wire → the board's activity-<id>.
          sessionKey: "activity-act-1",
        },
        {
          id: "act-2",
          title: "Draft the launch email",
          description: "Write the beta announcement to the waitlist",
          status: "done",
          updatedAt: ISO,
          sessionKey: "activity-act-2",
        },
      ],
    } satisfies ActivitiesViewModel);
  });

  it("creates a mission and returns its id + session key", async () => {
    const created: CreatedActivity = await h.sdk.activities.create(
      SEED_AGENT_ID,
      "Book the venue",
      "for the launch party",
    );
    expect(created.sessionKey).toBe(`activity-${created.id}`);

    await until(() => vm()?.items.length === 3, "created mission present");
    const item = vm()?.items.find((a) => a.id === created.id);
    expect(item).toMatchObject({
      title: "Book the venue",
      description: "for the launch party",
      // New missions are created running (PARITY §1).
      status: "running",
      sessionKey: created.sessionKey,
    });
  });

  it("sets status (approve → done), renames, and deletes", async () => {
    await h.sdk.activities.setStatus(SEED_AGENT_ID, "act-1", "done");
    await until(
      () => vm()?.items.find((a) => a.id === "act-1")?.status === "done",
      "act-1 approved to done",
    );

    await h.sdk.activities.rename(SEED_AGENT_ID, "act-1", "Trip to Kyoto");
    await until(
      () =>
        vm()?.items.find((a) => a.id === "act-1")?.title === "Trip to Kyoto",
      "act-1 renamed",
    );

    await h.sdk.activities.delete(SEED_AGENT_ID, "act-2");
    await until(
      () => vm()?.items.every((a) => a.id !== "act-2") === true,
      "act-2 deleted",
    );
    expect(vm()?.items.map((a) => a.id)).toEqual(["act-1"]);
  });

  it("archives and reactivates via status (PARITY §2 — no separate flag)", async () => {
    await h.sdk.activities.setStatus(SEED_AGENT_ID, "act-2", "archived");
    await until(
      () => vm()?.items.find((a) => a.id === "act-2")?.status === "archived",
      "act-2 archived",
    );
    await h.sdk.activities.setStatus(SEED_AGENT_ID, "act-2", "running");
    await until(
      () => vm()?.items.find((a) => a.id === "act-2")?.status === "running",
      "act-2 reactivated",
    );
  });

  it("live-updates on an external ActivityChanged (another client created one)", async () => {
    await h.sdk.activities.refresh(SEED_AGENT_ID);
    await until(() => vm()?.items.length === 2, "seed loaded");

    // A different client creates an activity directly on the host; the fake host
    // emits ActivityChanged on /v1/events, which the SDK's reactivity stream
    // catches and refetches from — no local mutation through the facade.
    const res = await fetch(`${host.url}/agents/${SEED_AGENT_ID}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Filed by another client" }),
    });
    expect(res.ok).toBe(true);

    await until(
      () => vm()?.items.length === 3,
      "ActivityChanged refetch grew the list to 3",
    );
    expect(vm()?.items.map((a) => a.title)).toContain(
      "Filed by another client",
    );
  });
});

describe("activities scope key", () => {
  it("is 'activities/<agentId>'", () => {
    expect(activitiesScope("abc")).toBe("activities/abc");
  });
});
