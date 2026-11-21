import { describe, expect, test } from "vitest";
import {
  EMPTY_STATE,
  mergeStorageState,
  type StorageState,
} from "./state-merge";

function cookie(name: string, value: string, domain = "example.com") {
  return {
    name,
    value,
    domain,
    path: "/",
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
  };
}

const state = (
  cookies: StorageState["cookies"],
  origins: StorageState["origins"] = [],
): StorageState => ({ cookies, origins });

const values = (s: StorageState) =>
  Object.fromEntries(s.cookies.map((c) => [`${c.name}@${c.domain}`, c.value]));

describe("mergeStorageState", () => {
  test("a chat that opened earlier never erases a sign-in made since", () => {
    const theirs = state([cookie("gh", "A", "github.com")]);
    const ours = state([cookie("gl", "B", "gitlab.com")]);
    expect(values(mergeStorageState(EMPTY_STATE, ours, theirs))).toEqual({
      "gh@github.com": "A",
      "gl@gitlab.com": "B",
    });
  });

  test("a cookie this chat never touched keeps the file's newer value", () => {
    const base = state([cookie("sid", "old")]);
    const theirs = state([cookie("sid", "relogged")]);
    expect(values(mergeStorageState(base, base, theirs))).toEqual({
      "sid@example.com": "relogged",
    });
  });

  test("a cookie this chat changed wins", () => {
    const base = state([cookie("sid", "old")]);
    const ours = state([cookie("sid", "mine")]);
    const theirs = state([cookie("sid", "old"), cookie("x", "1")]);
    expect(values(mergeStorageState(base, ours, theirs))).toEqual({
      "sid@example.com": "mine",
      "x@example.com": "1",
    });
  });

  test("a sign-out in this chat removes the cookie from the file", () => {
    const base = state([cookie("sid", "s"), cookie("pref", "dark")]);
    const ours = state([cookie("pref", "dark")]);
    expect(values(mergeStorageState(base, ours, base))).toEqual({
      "pref@example.com": "dark",
    });
  });

  test("same-name cookies on different domains are different sign-ins", () => {
    const theirs = state([cookie("sid", "1", "a.com")]);
    const ours = state([cookie("sid", "2", "b.com")]);
    expect(values(mergeStorageState(EMPTY_STATE, ours, theirs))).toEqual({
      "sid@a.com": "1",
      "sid@b.com": "2",
    });
  });

  test("origins merge by origin, ignoring localStorage order", () => {
    const o = (origin: string, ...pairs: [string, string][]) => ({
      origin,
      localStorage: pairs.map(([name, value]) => ({ name, value })),
    });
    const base = state([], [o("https://a.com", ["k", "1"], ["j", "2"])]);
    const ours = state([], [o("https://a.com", ["j", "2"], ["k", "1"])]);
    const theirs = state(
      [],
      [o("https://a.com", ["k", "new"]), o("https://b.com", ["t", "x"])],
    );
    expect(mergeStorageState(base, ours, theirs).origins).toEqual(
      theirs.origins,
    );
    const signedOut = mergeStorageState(base, state([]), theirs).origins;
    expect(signedOut.map((x) => x.origin)).toEqual(["https://b.com"]);
  });
});
