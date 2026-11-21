import { expect, test } from "vitest";
import {
  IntegrationUpstreamError,
  integrationUpstreamErrorFromResponse,
} from "./types";

const respond = (raw: string, status: number, contentType?: string) =>
  new Response(raw === "" ? null : raw, {
    status,
    headers: contentType ? { "content-type": contentType } : {},
  });

test("a well-formed json body is parsed and relayed with the status", async () => {
  const err = await integrationUpstreamErrorFromResponse(
    respond(JSON.stringify({ error: "not granted" }), 403, "application/json"),
    "gateway POST /execute",
  );
  expect(err).toBeInstanceOf(IntegrationUpstreamError);
  expect(err.status).toBe(403);
  expect(err.body).toEqual({ error: "not granted" });
});

test("a MALFORMED body with a json content-type still yields the typed error, raw text as detail", async () => {
  const raw = "<html>502 Bad Gateway</html>";
  const err = await integrationUpstreamErrorFromResponse(
    respond(raw, 502, "application/json; charset=utf-8"),
    "gateway GET /toolkits",
  );
  expect(err).toBeInstanceOf(IntegrationUpstreamError);
  expect(err.status).toBe(502);
  expect(err.body).toBe(raw);
  expect(err.message).toContain("502");
});

test("a non-json body relays as raw text; an empty body gets a status message", async () => {
  const text = await integrationUpstreamErrorFromResponse(
    respond("plain failure", 503, "text/plain"),
    "ctx",
  );
  expect(text.body).toBe("plain failure");

  const empty = await integrationUpstreamErrorFromResponse(
    respond("", 504),
    "ctx",
  );
  expect(empty.status).toBe(504);
  expect(empty.body).toEqual({ error: "integrations upstream returned 504" });
});
