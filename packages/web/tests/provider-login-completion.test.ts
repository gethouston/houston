import { isProviderLoginComplete } from "@houston/engine-adapter/client";
import { expect, test } from "vitest";

test("does not treat a stale stored credential as a completed OAuth login", () => {
  expect(
    isProviderLoginComplete({
      configured: true,
      login: { status: "awaiting_user" },
    }),
  ).toBe(false);
});

test("captures a credential only after OAuth completes", () => {
  expect(
    isProviderLoginComplete({
      configured: true,
      login: { status: "complete" },
    }),
  ).toBe(true);
  expect(isProviderLoginComplete({ configured: true, login: null })).toBe(true);
});
