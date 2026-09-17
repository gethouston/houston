import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resumeRequestFor } from "./resume-request";
import type { InflightTurnMarker } from "./turn-inflight-marker";

function seed(messages: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), "houston-resume-request-"));
  const conversations = join(dir, "conversations");
  mkdirSync(conversations, { recursive: true });
  writeFileSync(
    join(conversations, "chat.json"),
    JSON.stringify({
      id: "chat",
      title: "chat",
      createdAt: 1,
      updatedAt: 1,
      messages,
    }),
  );
  return { dir, conversations };
}

const marker = (
  over: Partial<InflightTurnMarker> = {},
): InflightTurnMarker => ({
  conversationId: "chat",
  turnId: "t-1",
  startedAt: 1_000,
  fenced: false,
  resume: {},
  ...over,
});

describe("resumeRequestFor", () => {
  it("carries the mentions and the gateway context the turn ran with", () => {
    const { conversations } = seed([
      {
        role: "user",
        content: "ping @Ada",
        ts: 1,
        turnId: "t-1",
        mentions: [{ userId: "u1", name: "Ada" }],
      },
    ]);
    const request = resumeRequestFor(
      conversations,
      marker({ resume: { context: { workspace: "w", user: "u" } } }),
      2_000,
    );
    expect(request?.mentions).toEqual([{ userId: "u1", name: "Ada" }]);
    expect(request?.context).toEqual({ workspace: "w", user: "u" });
  });

  it("resumes a per-user turn whose credential file survived", () => {
    const { dir, conversations } = seed([
      { role: "user", content: "go", ts: 1, turnId: "t-1" },
    ]);
    const authPath = join(dir, "auth.json");
    writeFileSync(authPath, "{}");
    const request = resumeRequestFor(
      conversations,
      marker({
        resume: { acting: { credentialScopeKey: "u:sub-1", authPath } },
      }),
      2_000,
    );
    expect(request?.acting?.credentialScopeKey).toBe("u:sub-1");
  });

  it("refuses when the member's credential did not survive the restart", () => {
    const { dir, conversations } = seed([
      { role: "user", content: "go", ts: 1, turnId: "t-1" },
    ]);
    expect(
      resumeRequestFor(
        conversations,
        marker({
          resume: {
            acting: {
              credentialScopeKey: "u:sub-1",
              authPath: join(dir, "gone", "auth.json"),
            },
          },
        }),
        2_000,
      ),
    ).toBeNull();
  });

  it("never refuses a team-scope turn on that check — the boot sync fetches it", () => {
    const { dir, conversations } = seed([
      { role: "user", content: "go", ts: 1, turnId: "t-1" },
    ]);
    expect(
      resumeRequestFor(
        conversations,
        marker({
          resume: {
            acting: {
              credentialScopeKey: "team",
              authPath: join(dir, "gone", "auth.json"),
            },
          },
        }),
        2_000,
      ),
    ).not.toBeNull();
  });
});
