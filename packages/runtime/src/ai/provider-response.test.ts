import { expect, test } from "vitest";
import {
  currentFailedResponse,
  makeProviderResponseRecorder,
  requestIdFromBody,
  runWithProviderResponseCapture,
} from "./provider-response";

type Handler = (event: unknown) => unknown;

/** A pi extension API stub: collects the handlers the recorder registers. */
function installRecorder(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const pi = {
    on: (event: string, handler: Handler) => {
      handlers[event] = handler;
    },
  };
  makeProviderResponseRecorder()(pi as never);
  return handlers;
}

test("a failed response's status and request id are readable for the rest of the prompt", async () => {
  const on = installRecorder();
  const seen = await runWithProviderResponseCapture(async () => {
    on.before_provider_request?.({ type: "before_provider_request" });
    await Promise.resolve();
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 400,
      headers: { "x-oai-request-id": "oai-123", "cf-ray": "ray-9" },
    });
    await Promise.resolve();
    return currentFailedResponse();
  });
  expect(seen).toEqual({ status: 400, requestId: "oai-123" });
});

test("a successful response is never attributed to a later failure", () => {
  const on = installRecorder();
  const seen = runWithProviderResponseCapture(() => {
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 200,
      headers: { "x-oai-request-id": "ok-1" },
    });
    return currentFailedResponse();
  });
  expect(seen).toBeUndefined();
});

test("a new request clears the previous request's failure", () => {
  const on = installRecorder();
  const seen = runWithProviderResponseCapture(() => {
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 429,
      headers: { "request-id": "req-old" },
    });
    // The retry goes over a transport with no response event (a WebSocket).
    on.before_provider_request?.({ type: "before_provider_request" });
    return currentFailedResponse();
  });
  expect(seen).toBeUndefined();
});

test("cf-ray stands in when the provider names no request id of its own", () => {
  const on = installRecorder();
  const seen = runWithProviderResponseCapture(() => {
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 400,
      headers: { "cf-ray": "ray-9" },
    });
    return currentFailedResponse();
  });
  expect(seen).toEqual({ status: 400, requestId: "ray-9" });
});

test("concurrent prompts keep their own record, and nothing is recorded outside one", async () => {
  const on = installRecorder();
  const respond = (status: number, id: string) =>
    on.after_provider_response?.({
      type: "after_provider_response",
      status,
      headers: { "x-request-id": id },
    });
  respond(500, "outside");
  expect(currentFailedResponse()).toBeUndefined();
  const [a, b] = await Promise.all([
    runWithProviderResponseCapture(async () => {
      respond(400, "a");
      await new Promise((r) => setTimeout(r, 0));
      return currentFailedResponse();
    }),
    runWithProviderResponseCapture(async () => {
      respond(503, "b");
      return currentFailedResponse();
    }),
  ]);
  expect(a).toEqual({ status: 400, requestId: "a" });
  expect(b).toEqual({ status: 503, requestId: "b" });
});

test("request ids in an error body are found; anything else is not one", () => {
  expect(
    requestIdFromBody(
      '{"type":"error","error":{"type":"invalid_request_error"},"request_id":"req_011CabcDEF"}',
    ),
  ).toBe("req_011CabcDEF");
  expect(requestIdFromBody("Bad request (request id: req_9xYz12345)")).toBe(
    "req_9xYz12345",
  );
  expect(requestIdFromBody('{"detail":"Bad Request"}')).toBeUndefined();
});
