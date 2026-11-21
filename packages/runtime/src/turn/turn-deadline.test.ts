import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { BROWSER_HANDOFF_LIMIT_MS } from "@houston/wire-types";
import { expect, test, vi } from "vitest";
import { runWithConversationId } from "../session/conversation-context";
import {
  MIN_HANDOFF_MS,
  TURN_END_RESERVE_MS,
  TURN_TOKEN_TTL_MS,
  turnHandoffBudget,
  turnTokenExpiry,
} from "./turn-deadline";
import { buildTurnBrowserTool } from "./turn-toolset";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function turnToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `turn-v1.${body}.c2lnbmF0dXJl`;
}

const expiringIn = (ms: number) =>
  turnToken({ org: "o", agent: "a", cid: "c", exp: (NOW + ms) / 1000 });

test("the expiry is the token's exp, in ms", () => {
  expect(turnTokenExpiry(expiringIn(20 * MIN), NOW - 5 * MIN)).toBe(
    NOW + 20 * MIN,
  );
});

test("an exp later than arrival plus the TTL is capped there (a sandbox clock behind the gateway's)", () => {
  expect(turnTokenExpiry(expiringIn(45 * MIN), NOW)).toBe(
    NOW + TURN_TOKEN_TTL_MS,
  );
});

test("with iat the lifetime counts from arrival, whatever this sandbox's clock says", () => {
  const behind = turnToken({
    iat: (NOW + 10 * MIN) / 1000,
    exp: (NOW + 25 * MIN) / 1000,
  });
  expect(turnTokenExpiry(behind, NOW)).toBe(NOW + 15 * MIN);
  const ahead = turnToken({
    iat: (NOW - 20 * MIN) / 1000,
    exp: (NOW - 5 * MIN) / 1000,
  });
  expect(turnTokenExpiry(ahead, NOW)).toBe(NOW + 15 * MIN);
  const long = turnToken({ iat: NOW / 1000, exp: (NOW + 45 * MIN) / 1000 });
  expect(turnTokenExpiry(long, NOW)).toBe(NOW + TURN_TOKEN_TTL_MS);
  const inverted = turnToken({
    iat: (NOW + 9 * MIN) / 1000,
    exp: (NOW + 8 * MIN) / 1000,
  });
  expect(turnTokenExpiry(inverted, NOW)).toBe(NOW + 8 * MIN);
});

test("a token with no readable exp falls back to arrival plus the TTL", () => {
  const fallback = NOW + TURN_TOKEN_TTL_MS;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const token of [
    undefined,
    "a".repeat(64),
    "turn-v1.only-one-part",
    "turn-v1.e30.sig.extra",
    `turn-v1.${Buffer.from("not json").toString("base64url")}.sig`,
    turnToken({ org: "o" }),
    turnToken({ exp: "soon" }),
    turnToken({ exp: -1 }),
  ])
    expect(turnTokenExpiry(token, NOW), String(token)).toBe(fallback);
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});

test("the budget is the full limit while the token has room, then its remainder", () => {
  const at = (msLeft: number) => turnHandoffBudget(NOW + msLeft, () => NOW)();
  expect(at(30 * MIN)).toBe(BROWSER_HANDOFF_LIMIT_MS);
  expect(at(12 * MIN)).toBe(12 * MIN - TURN_END_RESERVE_MS);
  expect(at(TURN_END_RESERVE_MS + MIN_HANDOFF_MS)).toBe(MIN_HANDOFF_MS);
  expect(at(TURN_END_RESERVE_MS + MIN_HANDOFF_MS - 1)).toBeNull();
  expect(at(-MIN)).toBeNull();
});

test("the budget is read at each hand-off, not when the turn started", () => {
  let now = NOW;
  const budget = turnHandoffBudget(NOW + 20 * MIN, () => now);
  expect(budget()).toBe(BROWSER_HANDOFF_LIMIT_MS);
  now += 12 * MIN;
  expect(budget()).toBe(5 * MIN);
});

test("a pooled turn whose token expires in 2 minutes refuses to hand over", async () => {
  const [tool] = buildTurnBrowserTool(
    { toolNames: ["browser"], includeRunCode: false },
    "/ws/Agent",
    true,
    turnTokenExpiry(expiringIn(2 * MIN), NOW),
    () => NOW,
  );
  if (!tool) throw new Error("no browser tool");
  const result = await runWithConversationId("c1", () =>
    tool.execute(
      "t",
      { action: "handoff", text: "Sign in" },
      undefined,
      undefined,
      {} as ExtensionToolContext,
    ),
  );
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "handoff_unavailable" },
  });
});
