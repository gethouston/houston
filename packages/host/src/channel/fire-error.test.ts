import { expect, test } from "vitest";
import { errorCodeFrom, TurnFireError } from "./fire-error";

test("errorCodeFrom reads the code out of a runtime JSON error body", () => {
  expect(
    errorCodeFrom('{"error":"No provider connected.","code":"no_provider"}'),
  ).toBe("no_provider");
});

test("errorCodeFrom is null for a code-less JSON body", () => {
  expect(errorCodeFrom('{"error":"boom"}')).toBeNull();
});

test("errorCodeFrom is null for non-JSON and empty bodies", () => {
  expect(errorCodeFrom("<html>502 Bad Gateway</html>")).toBeNull();
  expect(errorCodeFrom("")).toBeNull();
});

test("errorCodeFrom ignores a non-string or empty code", () => {
  expect(errorCodeFrom('{"code":7}')).toBeNull();
  expect(errorCodeFrom('{"code":""}')).toBeNull();
});

test("TurnFireError carries status and code alongside the verbatim message", () => {
  const err = new TurnFireError("runtime 409: nope", 409, "no_provider");
  expect(err).toBeInstanceOf(Error);
  expect(err.status).toBe(409);
  expect(err.code).toBe("no_provider");
  expect(err.message).toBe("runtime 409: nope");
});
