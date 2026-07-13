import { expect, test } from "vitest";
import { resolveStoreIrUrl } from "./portable-from-store-url";

const API = "https://gateway.gethouston.ai";

test("resolves a full share link to the gateway IR url", () => {
  const r = resolveStoreIrUrl(
    "https://agents.gethouston.ai/a/inbox-helper",
    API,
  );
  expect(r).toEqual({
    irUrl: "https://gateway.gethouston.ai/v1/agentstore/agents/inbox-helper",
  });
});

test("tolerates a trailing slash on the share path", () => {
  const r = resolveStoreIrUrl(
    "https://agents.gethouston.ai/a/inbox-helper/",
    API,
  );
  expect(r).toEqual({
    irUrl: "https://gateway.gethouston.ai/v1/agentstore/agents/inbox-helper",
  });
});

test("resolves a bare slug against the configured gateway", () => {
  const r = resolveStoreIrUrl("  inbox-helper  ", API);
  expect(r).toEqual({
    irUrl: "https://gateway.gethouston.ai/v1/agentstore/agents/inbox-helper",
  });
});

test("a share link on any host resolves to the configured gateway", () => {
  // The pasted host provides only the slug; the fetch always targets the gateway.
  const r = resolveStoreIrUrl("https://agents.example.com/a/foo", API);
  expect(r).toEqual({
    irUrl: "https://gateway.gethouston.ai/v1/agentstore/agents/foo",
  });
});

test("empty input is rejected", () => {
  expect(resolveStoreIrUrl("   ", API)).toHaveProperty("error");
});

test("http (non-https) links are rejected", () => {
  expect(resolveStoreIrUrl("http://agents.gethouston.ai/a/foo", API)).toEqual({
    error: "The link must start with https://.",
  });
});

test("credentials in the URL are rejected", () => {
  const r = resolveStoreIrUrl(
    "https://user:pass@agents.gethouston.ai/a/foo",
    API,
  );
  expect(r).toEqual({
    error: "The link must not contain a username or password.",
  });
});

test.each([
  "https://localhost/a/foo",
  "https://127.0.0.1/a/foo",
  "https://10.0.0.5/a/foo",
  "https://169.254.169.254/a/foo",
  "https://[::1]/a/foo",
  "https://metadata/a/foo",
  "https://box.local/a/foo",
  "https://svc.internal/a/foo",
])("blocks the private/internal host %s", (link) => {
  expect(resolveStoreIrUrl(link, API)).toEqual({
    error: "That link points to an address we cannot open.",
  });
});

test("a URL that is not a /a/<slug> share link is rejected", () => {
  expect(
    resolveStoreIrUrl("https://agents.gethouston.ai/explore", API),
  ).toEqual({ error: "That is not a Houston agent share link." });
});

test("a slug with illegal characters is rejected", () => {
  expect(resolveStoreIrUrl("not a slug!", API)).toEqual({
    error: "That is not a valid agent link or name.",
  });
});

test("a share-path slug with a slash cannot escape the /a/ segment", () => {
  expect(
    resolveStoreIrUrl("https://agents.gethouston.ai/a/foo/bar", API),
  ).toEqual({ error: "That is not a Houston agent share link." });
});
