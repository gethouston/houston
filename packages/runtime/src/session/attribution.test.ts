import { expect, test } from "vitest";
import {
  decodeActingAuthor,
  framePrompt,
  type MessageAuthor,
  shouldFrame,
} from "./attribution";

/** Mint an `acting-v1.<payloadB64Url>.<sig>` token carrying `payload`. */
function token(payload: Record<string, unknown>, sig = "sig"): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `acting-v1.${b64}.${sig}`;
}

test("decodeActingAuthor reads {sub, name} off the token payload — no sig check", () => {
  const author = decodeActingAuthor(
    token({ sub: "user_123", name: "Ada", agent: "mercury", exp: 1 }),
  );
  expect(author).toEqual({ userId: "user_123", name: "Ada" });
});

test("decodeActingAuthor keeps sub even when the sig is garbage (gateway already verified)", () => {
  const author = decodeActingAuthor(
    token({ sub: "user_123", name: "Ada" }, "not-a-real-signature"),
  );
  expect(author).toEqual({ userId: "user_123", name: "Ada" });
});

test("decodeActingAuthor omits name when the payload has none", () => {
  expect(decodeActingAuthor(token({ sub: "user_123" }))).toEqual({
    userId: "user_123",
  });
});

test("decodeActingAuthor returns undefined for absent / garbled / sub-less tokens", () => {
  expect(decodeActingAuthor(undefined)).toBeUndefined();
  expect(decodeActingAuthor("")).toBeUndefined();
  expect(decodeActingAuthor("acting-v1")).toBeUndefined(); // no payload segment
  expect(decodeActingAuthor("acting-v1.@@@.sig")).toBeUndefined(); // unparseable
  expect(decodeActingAuthor(token({ name: "Ada" }))).toBeUndefined(); // no sub
  expect(decodeActingAuthor(token({ sub: "" }))).toBeUndefined(); // empty sub
});

const ada: MessageAuthor = { userId: "user_a", name: "Ada" };
const bob: MessageAuthor = { userId: "user_b", name: "Bob" };

test("shouldFrame: never for an authorless turn", () => {
  expect(shouldFrame(undefined, [ada, bob])).toBe(false);
});

test("shouldFrame: never in a single-author conversation", () => {
  expect(shouldFrame(ada, [])).toBe(false); // first message
  expect(shouldFrame(ada, [ada, ada])).toBe(false); // all Ada
  expect(shouldFrame(ada, [undefined])).toBe(false); // prior authorless message
});

test("shouldFrame: true once a DIFFERENT author has posted", () => {
  expect(shouldFrame(bob, [ada])).toBe(true);
  expect(shouldFrame(ada, [ada, bob])).toBe(true);
});

test("framePrompt: single-author / authorless turns pass text through unchanged", () => {
  expect(framePrompt("hi", ada, [])).toBe("hi");
  expect(framePrompt("hi", ada, [ada])).toBe("hi");
  expect(framePrompt("hi", undefined, [ada, bob])).toBe("hi");
});

test("framePrompt: prefixes [From: <name>] when ≥2 distinct authors are present", () => {
  expect(framePrompt("hi", bob, [ada])).toBe("[From: Bob]\nhi");
});

test("framePrompt: falls back to an 8-char userId prefix when the author has no name", () => {
  const nameless: MessageAuthor = { userId: "user_bcdef_long" };
  expect(framePrompt("hi", nameless, [ada])).toBe("[From: user_bcd]\nhi");
});
