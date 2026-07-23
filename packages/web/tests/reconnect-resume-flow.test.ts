import {
  FAKE_TOKEN,
  type FakeHost,
  SEED_AGENT_ID,
  startFakeHost,
} from "@houston/fake-host";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { conversationVm } from "../src/engine-adapter/vm";

/**
 * Real-chain guard for the reconnect auto-continue (HOU-849): the REAL
 * `startSession` against the REAL fake host, with the conversation VM wedged
 * on a stale `running` flag — the state a provider-reconnect resume finds
 * when the failed turn's stream died without a settle. The resume must be
 * HELD (queued), then actually reach the engine once the passive observer
 * confirms the conversation is idle. The unit tests in send-queue.test.ts
 * drive `confirmIdle` by hand; this drives the whole wiring.
 */

let host: FakeHost;

beforeAll(async () => {
  host = await startFakeHost(0);
});

afterAll(async () => {
  await host.stop();
});

const historyOf = async (sessionKey: string): Promise<string[]> => {
  const res = await fetch(
    `${host.url}/agents/${SEED_AGENT_ID}/conversations/${sessionKey}/messages`,
    { headers: { authorization: `Bearer ${FAKE_TOKEN}` } },
  );
  const body = (await res.json()) as {
    messages: { role: string; content: string }[];
  };
  return body.messages.filter((m) => m.role === "user").map((m) => m.content);
};

test("a resume held against a stale running flag still reaches the engine", async () => {
  const client = new HoustonClient({
    baseUrl: host.url,
    token: FAKE_TOKEN,
    controlPlane: true,
  });
  const sessionKey = "resume-wedge-1";
  const resumeText =
    "<!--houston:auto_continue-->\n\nI'm signed in again. Please continue where you left off.";

  // The wedge: the VM says a turn is running, but nothing is streaming it —
  // the failed turn's stream was torn down without a settle.
  conversationVm.sessionStatus(SEED_AGENT_ID, sessionKey, "running");

  await client.startSession(SEED_AGENT_ID, {
    sessionKey,
    prompt: resumeText,
    autoResume: true,
    queuedPreview: { text: "I'm signed in again." },
  });

  // The held resume must flush once the observer confirms idle — the message
  // actually lands in the engine's transcript.
  await vi.waitFor(
    async () => {
      expect(await historyOf(sessionKey)).toContain(resumeText);
    },
    { timeout: 10_000, interval: 250 },
  );
});
