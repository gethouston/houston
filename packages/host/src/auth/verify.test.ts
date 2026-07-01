import { expect, test } from "vitest";
import {
  DevTokenVerifier,
  parseServiceTokens,
  ServiceTokenVerifier,
} from "./verify";

/**
 * The OPEN token verifiers (dev / service-token wrapper + parseServiceTokens).
 * The CLOUD SupabaseTokenVerifier (jose/JWKS) is tested in `@houston/host-cloud`
 * (auth/verify-supabase.test.ts) — the closed half of the auth/verify.ts split.
 */

test("DevTokenVerifier parses 'dev:<userId>'", async () => {
  const v = new DevTokenVerifier();
  expect(await v.verify("dev:u123")).toEqual({ userId: "u123" });
  expect(await v.verify("Bearer dev:u123")).toEqual({ userId: "u123" });
});

test("DevTokenVerifier rejects non-dev and empty-id tokens", async () => {
  const v = new DevTokenVerifier();
  expect(await v.verify("u123")).toBeNull();
  expect(await v.verify("dev:")).toBeNull();
  expect(await v.verify("")).toBeNull();
  expect(await v.verify("bearer:u123")).toBeNull();
});

test("ServiceTokenVerifier matches a static token, else falls through", async () => {
  const tok = "a".repeat(64);
  const v = new ServiceTokenVerifier(
    parseServiceTokens(`${tok}=eval-user`),
    new DevTokenVerifier(),
  );
  expect(await v.verify(tok)).toEqual({ userId: "eval-user" });
  expect(await v.verify(`Bearer ${tok}`)).toEqual({ userId: "eval-user" });
  // Fall-through: still a working dev verifier underneath.
  expect(await v.verify("dev:u1")).toEqual({ userId: "u1" });
  expect(await v.verify("nope")).toBeNull();
});

test("parseServiceTokens enforces shape and minimum token length", () => {
  expect(parseServiceTokens("").size).toBe(0);
  const tok1 = "b".repeat(32);
  const tok2 = "c".repeat(40);
  const map = parseServiceTokens(` ${tok1}=u1 , ${tok2}=u2 `);
  expect(map.get(tok1)).toBe("u1");
  expect(map.get(tok2)).toBe("u2");
  expect(() => parseServiceTokens("short=u1")).toThrow(/at least 32 chars/);
  expect(() =>
    parseServiceTokens("justatokenwithnouseridxxxxxxxxxxxxxx"),
  ).toThrow(/<token>=<userId>/);
});
