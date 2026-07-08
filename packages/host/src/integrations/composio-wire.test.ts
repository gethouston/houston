import { expect, test } from "vitest";
import { deriveAccountLabel, mapConnection } from "./composio-wire";

/**
 * The account-label derivation is the ONLY place a connected account is turned
 * into a human name, and the precedence (alias → state.val identifier →
 * word_id → nothing) is load-bearing for the multi-account UI. Pin it.
 */

test("a non-empty alias wins over everything", () => {
  expect(
    deriveAccountLabel({
      alias: "Work",
      state: { val: { email: "me@work.com" } },
      word_id: "T123",
    }),
  ).toBe("Work");
});

test("an empty/whitespace alias is ignored, falling through to state.val", () => {
  expect(
    deriveAccountLabel({
      alias: "   ",
      state: { val: { email: "me@work.com" } },
    }),
  ).toBe("me@work.com");
});

test("state.val is scanned in key precedence order (email before name)", () => {
  expect(
    deriveAccountLabel({
      state: { val: { name: "Ignored", username: "handle", email: "e@x.com" } },
    }),
  ).toBe("e@x.com");
  // With no email/user_email, username is next.
  expect(deriveAccountLabel({ state: { val: { username: "handle" } } })).toBe(
    "handle",
  );
  // A lower-precedence key wins when the higher ones are empty strings.
  expect(
    deriveAccountLabel({
      state: { val: { email: "", username: "", workspace: "Acme" } },
    }),
  ).toBe("Acme");
});

test("non-string / empty state values are skipped, then word_id is the last resort", () => {
  expect(
    deriveAccountLabel({
      state: { val: { email: 42, account: null } },
      word_id: "T123",
    }),
  ).toBe("T123");
});

test("nothing identifying → undefined", () => {
  expect(deriveAccountLabel({})).toBeUndefined();
  expect(
    deriveAccountLabel({ state: { val: {} }, word_id: "  " }),
  ).toBeUndefined();
});

test("mapConnection attaches the derived label, and omits it when absent", () => {
  expect(
    mapConnection({
      toolkit: { slug: "gmail" },
      id: "ca_1",
      status: "ACTIVE",
      state: { val: { email: "me@work.com" } },
    }),
  ).toEqual({
    toolkit: "gmail",
    connectionId: "ca_1",
    status: "active",
    accountLabel: "me@work.com",
  });
  expect(
    mapConnection({ toolkit: { slug: "gmail" }, id: "ca_2", status: "ACTIVE" }),
  ).toEqual({ toolkit: "gmail", connectionId: "ca_2", status: "active" });
});
