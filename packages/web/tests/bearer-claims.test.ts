import {
  describeBearer,
  formatBearerDescription,
} from "@houston/engine-adapter/cp/bearer-claims";
import { expect, test } from "vitest";

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function jwt(header: unknown, claims: unknown): string {
  return `${b64url(header)}.${b64url(claims)}.sig`;
}

test("describes a bearer's timing claims without verifying it", () => {
  const nowMs = 1_800_000_000_000;
  const nowS = nowMs / 1000;
  const token = jwt(
    { alg: "RS256", kid: "k1" },
    { iat: nowS - 30, exp: nowS + 3570, sub: "u" },
  );
  expect(describeBearer(token, nowMs)).toEqual({
    expiresInS: 3570,
    issuedAgoS: 30,
    kid: "k1",
  });
});

test("an expired bearer reads as a negative expiry", () => {
  const nowMs = 1_800_000_000_000;
  const nowS = nowMs / 1000;
  const token = jwt({ alg: "RS256" }, { iat: nowS - 4000, exp: nowS - 400 });
  expect(describeBearer(token, nowMs)).toEqual({
    expiresInS: -400,
    issuedAgoS: 4000,
    kid: null,
  });
});

test("anything that is not a JWT with a JSON payload yields null", () => {
  expect(describeBearer("", 0)).toBeNull();
  expect(describeBearer("dev:user-1", 0)).toBeNull();
  expect(describeBearer("a.b.c", 0)).toBeNull();
  expect(describeBearer(`${b64url({})}.${b64url("str")}.c`, 0)).toBeNull();
});

test("the breadcrumb rendering never contains the token", () => {
  const nowMs = 1_800_000_000_000;
  const token = jwt({ kid: "k9" }, { iat: nowMs / 1000 - 1 });
  const line = formatBearerDescription(describeBearer(token, nowMs));
  expect(line).toBe("expires_in_s=? issued_ago_s=1 kid=k9");
  expect(line).not.toContain(token);
  expect(formatBearerDescription(null)).toBe("not a JWT");
});
