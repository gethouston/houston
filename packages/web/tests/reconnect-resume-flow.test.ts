import { HoustonClient } from "@houston/engine-adapter/client";
import { conversationVm } from "@houston/engine-adapter/vm";
import {
  FAKE_TOKEN,
  type FakeHost,
  SEED_AGENT_ID,
  startFakeHost,
} from "@houston/fake-host";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

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

  conversationVm.sessionStatus(SEED_AGENT_ID, sessionKey, "running");

  await client.startSession(SEED_AGENT_ID, {
    sessionKey,
    prompt: resumeText,
    autoResume: true,
    queuedPreview: { text: "I'm signed in again." },
  });

  await vi.waitFor(
    async () => {
      expect(await historyOf(sessionKey)).toContain(resumeText);
    },
    { timeout: 10_000, interval: 250 },
  );
});
