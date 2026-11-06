import { expect, test } from "vitest";
import { TurnTimezoneSchema } from "./turn-timezone";
import { WireAgentSchema } from "./wire-agent";

const agent = { id: "a", workspaceId: "w", name: "Helper", createdAt: 0 };

test("agent timezone is additive and names the firing zone", () => {
  expect(WireAgentSchema.parse(agent)).toEqual(agent);
  expect(
    WireAgentSchema.parse({ ...agent, timezone: "Asia/Tokyo" }).timezone,
  ).toBe("Asia/Tokyo");
});

test("a zone this device's time zone data lacks never rejects the agent", () => {
  // The server validated it; an older WebKit may not know a newer IANA name.
  expect(
    WireAgentSchema.parse({ ...agent, timezone: "Mars/Olympus" }).timezone,
  ).toBe("Mars/Olympus");
});

test.each([
  undefined,
  "UTC",
  "America/Bogota",
])("turn timezone accepts %s", (zone) => {
  expect(TurnTimezoneSchema.parse(zone)).toBe(zone);
});

test.each([
  "Mars/Olympus",
  "",
  "+01:00",
  null,
  42,
])("turn timezone refuses %s", (zone) => {
  expect(TurnTimezoneSchema.safeParse(zone).success).toBe(false);
});
