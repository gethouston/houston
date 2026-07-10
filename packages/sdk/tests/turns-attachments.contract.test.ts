/**
 * Composer-attachments contract: `sdk.turns.saveAttachments` (and the
 * `turns/attachments/save` bridge command) drive the REAL fake host's
 * `attachments` route over real HTTP — the files land in the agent's visible
 * `uploads/` folder, colliding names are disambiguated, and the returned
 * relative paths are exactly what the agent's Read tool opens.
 */

import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import type { CommandResult } from "@houston/sdk";
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

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("turns/attachments/save against the fake host", () => {
  it("stores an upload under uploads/ and returns its relative path", async () => {
    const out = await h.sdk.turns.saveAttachments({
      agentId: SEED_AGENT_ID,
      scopeId: "conv-1",
      files: [{ name: "brief.pdf", contentBase64: b64("hello") }],
    });
    expect(out).toEqual({ paths: ["uploads/brief.pdf"] });
  });

  it("disambiguates a name that collides with an earlier upload", async () => {
    await h.sdk.turns.saveAttachments({
      agentId: SEED_AGENT_ID,
      scopeId: "conv-1",
      files: [{ name: "report.csv", contentBase64: b64("one") }],
    });
    const second = await h.sdk.turns.saveAttachments({
      agentId: SEED_AGENT_ID,
      scopeId: "conv-2",
      files: [{ name: "report.csv", contentBase64: b64("two") }],
    });
    // Durable uploads never clobber: the second lands beside the first, with
    // the counter inserted before the extension (like the real host).
    expect(second).toEqual({ paths: ["uploads/report (1).csv"] });
  });

  it("drives the same route through the bridge command path", async () => {
    const result = (await h.sdk.dispatch({
      id: "c-att",
      type: "turns/attachments/save",
      payload: {
        agentId: SEED_AGENT_ID,
        scopeId: "conv-3",
        files: [{ name: "photo.png", contentBase64: b64("img") }],
      },
    })) as CommandResult;
    expect(result).toEqual({
      id: "c-att",
      ok: true,
      value: { paths: ["uploads/photo.png"] },
    });
  });

  it("rejects an empty files array before touching the host", async () => {
    const result = (await h.sdk.dispatch({
      id: "c-bad",
      type: "turns/attachments/save",
      payload: { agentId: SEED_AGENT_ID, scopeId: "conv-4", files: [] },
    })) as CommandResult;
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/non-empty files/) },
    });
  });
});
