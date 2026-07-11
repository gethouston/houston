import { expect, test } from "vitest";
import { actingAuthorFromHeader } from "./acting";

const payload = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

test("decodes {user_id, name} from a well-formed acting-as header", () => {
  const token = `acting-v1.${payload({ sub: "user-123", name: "Ada", exp: 1 })}.sig`;
  expect(actingAuthorFromHeader(token)).toEqual({
    user_id: "user-123",
    name: "Ada",
  });
});

test("omits name when the payload has none (or an empty/non-string one)", () => {
  expect(
    actingAuthorFromHeader(`acting-v1.${payload({ sub: "u1" })}.sig`),
  ).toEqual({ user_id: "u1" });
  expect(
    actingAuthorFromHeader(`acting-v1.${payload({ sub: "u1", name: "" })}.sig`),
  ).toEqual({ user_id: "u1" });
  expect(
    actingAuthorFromHeader(`acting-v1.${payload({ sub: "u1", name: 42 })}.sig`),
  ).toEqual({ user_id: "u1" });
});

test("takes the first value of a repeated header", () => {
  const token = `acting-v1.${payload({ sub: "first", name: "F" })}.sig`;
  expect(actingAuthorFromHeader([token, "acting-v1.other.sig"])).toEqual({
    user_id: "first",
    name: "F",
  });
});

test("anything malformed reads as no author (null), never a throw", () => {
  expect(actingAuthorFromHeader(undefined)).toBeNull();
  expect(actingAuthorFromHeader("")).toBeNull();
  expect(actingAuthorFromHeader(42)).toBeNull();
  expect(actingAuthorFromHeader({})).toBeNull();
  expect(actingAuthorFromHeader("acting-v1.onlytwo")).toBeNull();
  expect(actingAuthorFromHeader("wrong-prefix.abc.sig")).toBeNull();
  expect(
    actingAuthorFromHeader("acting-v1.!!!not-base64url!!!.sig"),
  ).toBeNull();
  expect(
    actingAuthorFromHeader(
      `acting-v1.${Buffer.from("not json").toString("base64url")}.sig`,
    ),
  ).toBeNull();
  expect(
    actingAuthorFromHeader(`acting-v1.${payload({ name: "no sub" })}.sig`),
  ).toBeNull();
  expect(
    actingAuthorFromHeader(`acting-v1.${payload({ sub: "" })}.sig`),
  ).toBeNull();
  expect(
    actingAuthorFromHeader(`acting-v1.${payload({ sub: 42 })}.sig`),
  ).toBeNull();
});
