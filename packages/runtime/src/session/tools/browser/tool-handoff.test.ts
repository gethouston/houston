import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { actingFromHeaders } from "../../acting-context";
import { runWithConversationId } from "../../conversation-context";
import { runWithTurnMode } from "../../turn-mode-context";
import { handoffOwner } from "./handoff";
import { HandoffRegistry } from "./live/registry";
import { BrowserPool } from "./pool";
import { type HandoffBudget, makeBrowserTool } from "./tool";

const noBrowser = () =>
  new BrowserPool({
    launch: () => Promise.reject(new Error("no browser should launch")),
  });

function handOver(liveView: boolean, handoffBudget?: HandoffBudget) {
  const tool = makeBrowserTool({
    workspaceDir: "/ws/Agent",
    liveView,
    pool: noBrowser(),
    handoffs: new HandoffRegistry(),
    ...(handoffBudget ? { handoffBudget } : {}),
  });
  return tool.execute(
    "t",
    { action: "handoff", text: "Sign in" },
    undefined,
    undefined,
    {} as ExtensionToolContext,
  );
}

test("no live view here: handoff is a named refusal that says what to do", async () => {
  const result = await runWithConversationId("c1", () => handOver(false));
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "handoff_unavailable" },
  });
  expect(result.content[0]).toMatchObject({
    text: expect.stringMatching(/^ERROR handoff_unavailable: .*sign in to/),
  });
});

test("outside a conversation there is nobody to hand the browser to", async () => {
  const result = await handOver(true);
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "handoff_unavailable" },
  });
});

test("a turn too close to its end refuses before touching the browser", async () => {
  const result = await runWithConversationId("c1", () =>
    handOver(true, () => null),
  );
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "handoff_unavailable" },
  });
  expect(result.content[0]).toMatchObject({
    text: expect.stringMatching(/run too long.*new message/),
  });
});

test("an Autopilot turn never waits on the person", async () => {
  await expect(
    runWithTurnMode({ current: "auto" }, () =>
      runWithConversationId("c1", () => handOver(true)),
    ),
  ).rejects.toThrow(/Autopilot mode, so you can no longer hand the browser/);
});

test("the description tells the model about handoff only when it is offered", () => {
  const describe = (liveView: boolean) =>
    makeBrowserTool({ workspaceDir: "/ws", liveView }).description;
  expect(describe(true)).toContain("call handoff");
  expect(describe(false)).not.toContain("handoff");
});

const signedAs = (sub: string) =>
  `acting-v1.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;

test("a hand-off belongs to the signed acting-as, else a pooled turn's verified owner", () => {
  expect(handoffOwner({ actingAs: signedAs("member-a") })).toBe("member-a");
  expect(
    handoffOwner({ actingAs: signedAs("member-a"), verifiedOwner: "other" }),
  ).toBe("member-a");
  expect(handoffOwner({ verifiedOwner: "member-b" })).toBe("member-b");
});

test("an unsigned acting-user header never owns a hand-off (the desktop's first-day turn)", () => {
  expect(handoffOwner({ actingUser: "desktop-user" })).toBeUndefined();
  const standing = actingFromHeaders({
    "x-houston-acting-user": "desktop-user",
    "x-houston-verified-owner": "desktop-user",
  });
  expect(standing?.verifiedOwner).toBeUndefined();
  expect(handoffOwner(standing)).toBeUndefined();
  expect(handoffOwner(undefined)).toBeUndefined();
});
