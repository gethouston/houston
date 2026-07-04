/**
 * Mission-search contract: ranked full-text search over the host's missions,
 * mirroring the desktop EXACTLY — a TITLE match first (no snippet), then a
 * DESCRIPTION match, then lazily-fetched chat-history CONTENT. Title/description
 * run off the activities list; content fetches each unmatched mission's history
 * (bounded, no observers).
 */

import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import type { MissionMatch } from "@houston/sdk";
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
  cannedReply,
  convVm,
  type Harness,
  makeSdk,
  resetHost,
  startHost,
  until,
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

describe("missions/search — ranked matches", () => {
  it("matches the TITLE first, with no snippet (the title shows the phrase)", async () => {
    const matches = await h.sdk.missions.search("Tokyo");
    expect(matches).toEqual([
      {
        agentId: SEED_AGENT_ID,
        activityId: "act-1",
        sessionKey: "activity-act-1",
        title: "Plan a trip to Tokyo",
        matchedIn: "title",
      } satisfies MissionMatch,
    ]);
  });

  it("matches the DESCRIPTION with a highlighted snippet", async () => {
    const matches = await h.sdk.missions.search("beta announcement");
    expect(matches).toHaveLength(1);
    const [m] = matches;
    expect(m.activityId).toBe("act-2");
    expect(m.matchedIn).toBe("description");
    expect(m.snippet).toContain("beta announcement");
  });

  it("is accent/case-insensitive (folds like the desktop)", async () => {
    // "tokyo" lower-cases the title match; the fold is the same one the board uses.
    expect((await h.sdk.missions.search("tokyo"))[0]?.activityId).toBe("act-1");
  });

  it("falls through to lazily-fetched history CONTENT", async () => {
    // A phrase in neither title nor description, only in the chat transcript.
    const cid = "activity-act-1";
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "pistachio",
    });
    await until(() => convVm(h.sdk, cid)?.running === false, "turn settled");

    const matches = await h.sdk.missions.search("pistachio");
    expect(matches).toHaveLength(1);
    const [m] = matches;
    expect(m.activityId).toBe("act-1");
    expect(m.matchedIn).toBe("content");
    // The canned reply echoes the phrase, so the snippet surfaces it.
    expect(m.snippet).toContain("pistachio");
    expect(cannedReply("pistachio")).toContain("pistachio");
  });

  it("scopes to a single agent when agentId is given", async () => {
    const matches = await h.sdk.missions.search("Tokyo", SEED_AGENT_ID);
    expect(matches.map((m) => m.activityId)).toEqual(["act-1"]);
  });

  it("returns nothing for a blank or unmatched query", async () => {
    expect(await h.sdk.missions.search("   ")).toEqual([]);
    expect(await h.sdk.missions.search("nonexistent-zzz")).toEqual([]);
  });
});
