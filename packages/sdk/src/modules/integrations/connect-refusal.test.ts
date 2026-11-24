import { describe, expect, it } from "vitest";
import { integrationConnectRefusal } from "./connect-refusal";

// The error shapes a refused connect reaches a classifier in: the adapter's
// HoustonEngineError with a PARSED body, the local runtime-client's
// EngineError with the RAW response text, and the SDK's own errors whose
// message is the response text.
const parsedBody = (body: unknown) => Object.assign(new Error("x"), { body });
const rawBody = (body: unknown) =>
  Object.assign(new Error("x"), { body: JSON.stringify(body) });
const messageBody = (body: unknown) => new Error(JSON.stringify(body));

describe("integrationConnectRefusal", () => {
  it.each([
    "toolkit_oauth_unavailable",
    "toolkit_no_auth",
    "toolkit_not_found",
  ])("names %s on every error shape", (code) => {
    const body = { error: "…", code };
    expect(integrationConnectRefusal(parsedBody(body))).toBe(code);
    expect(integrationConnectRefusal(rawBody(body))).toBe(code);
    expect(integrationConnectRefusal(messageBody(body))).toBe(code);
  });

  it("reads an older gateway's 500 detail as OAuth unavailable", () => {
    const body = {
      detail:
        'composio: toolkit "highlevel" only offers OAuth and Composio has no managed app for it',
      error: "integrations route failed",
    };
    expect(integrationConnectRefusal(rawBody(body))).toBe(
      "toolkit_oauth_unavailable",
    );
    expect(integrationConnectRefusal(parsedBody(body))).toBe(
      "toolkit_oauth_unavailable",
    );
  });

  it("is null for other codes, other details and untyped errors", () => {
    expect(
      integrationConnectRefusal(parsedBody({ code: "agent_not_found" })),
    ).toBeNull();
    expect(
      integrationConnectRefusal(
        rawBody({
          detail: "composio POST /api/v3/auth_configs → 500: upstream hiccup",
          error: "integrations route failed",
        }),
      ),
    ).toBeNull();
    expect(
      integrationConnectRefusal(
        Object.assign(new Error("x"), { body: "<html>" }),
      ),
    ).toBeNull();
    expect(integrationConnectRefusal(new Error("boom"))).toBeNull();
    expect(integrationConnectRefusal(null)).toBeNull();
    expect(integrationConnectRefusal("toolkit_no_auth")).toBeNull();
  });
});
