import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { decodeIdTokenClaims } from "../src/lib/identity/id-token.ts";
import {
  type IdentityLogLevel,
  setIdentityLogSink,
} from "../src/lib/identity/log.ts";
import { deserializeSession } from "../src/lib/identity/session.ts";

afterEach(() => setIdentityLogSink(null));

describe("identity/log sink", () => {
  it("routes a legacy-blob discard to the wired sink (never silent)", () => {
    const seen: Array<[IdentityLogLevel, string, string?]> = [];
    setIdentityLogSink((l, m, c) => seen.push([l, m, c]));
    strictEqual(deserializeSession('{"access_token":"sb"}'), null);
    strictEqual(seen.length, 1);
    strictEqual(seen[0][0], "warn");
    strictEqual(seen[0][2], "identity/session");
  });

  it("routes a malformed-id-token discard to the wired sink", () => {
    const seen: IdentityLogLevel[] = [];
    setIdentityLogSink((l) => seen.push(l));
    strictEqual(decodeIdTokenClaims("garbage"), null);
    deepStrictEqual(seen, ["warn"]);
  });
});
