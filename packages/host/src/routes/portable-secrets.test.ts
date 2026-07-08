import { expect, test } from "vitest";
import { redactSecrets } from "./portable-secrets";

/**
 * The secretlint-backed credential scrub. Every key below is SYNTHETIC —
 * format-valid but fake, and assembled from parts at runtime so neither
 * secretlint's own repo scan nor GitHub push protection sees a literal.
 */

const fake = (...parts: string[]) => parts.join("");

test("replaces well-known credential shapes with <secret>", async () => {
  const text = [
    `github: ${fake("ghp", "_0123456789", "abcdefghijklmnopqrstuvwxyz")}`,
    `anthropic: ${fake("sk-ant-", "api03-")}${"a".repeat(93)}AA`,
    `aws id: ${fake("AKIA", "Q3EGRIJCXPLZOK4W")}`,
    `db: ${fake("postgres://admin:", "hunter2secret", "@db.internal:5432/prod")}`,
    `slack: ${fake("xoxb", "-1234567890", "-1234567890123", "-AbCdEfGhIjKlMnOpQrStUvWx")}`,
  ].join("\n");
  const r = await redactSecrets(text);
  expect(r.count).toBe(5);
  expect(r.text).not.toContain("ghp");
  expect(r.text).not.toContain("sk-ant-");
  expect(r.text).not.toContain("AKIA");
  expect(r.text).not.toContain("hunter2secret");
  expect(r.text).not.toContain("xoxb");
  expect(r.text).toContain("github: <secret>");
  expect(r.text).toContain("aws id: <secret>");
});

test("redacts private key blocks", async () => {
  const body = `MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ${"a1B2c3D4e5F6g7H8i9J0".repeat(10)}`;
  const pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
  const r = await redactSecrets(`deploy cert:\n${pem}\ndone`);
  expect(r.count).toBe(1);
  expect(r.text).toBe("deploy cert:\n<secret>\ndone");
});

test("leaves clean text untouched", async () => {
  const text = "Check the weather in Medellín and draft the daily digest.";
  const r = await redactSecrets(text);
  expect(r).toEqual({ text, count: 0 });
});

test("merges overlapping findings into one replacement", async () => {
  // The same span can be flagged by multiple rules; the output must not
  // contain nested/duplicated <secret> tokens.
  const r = await redactSecrets(
    `url: ${fake("postgres://admin:", "hunter2secret", "@db.internal:5432/prod")}`,
  );
  expect(r.text).toBe("url: <secret>");
});
