import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isToolkitOauthUnavailableError } from "../src/lib/toolkit-oauth-unavailable.ts";

// The two adapter error shapes the connect flow can catch: the cloud control
// plane throws with a PARSED JSON body (HoustonEngineError), the local
// runtime-client with the RAW response text (EngineError). Both must be
// recognized when they carry the typed code, plus the transitional gateway
// shape (a 500 whose `detail` carries the raw auth-config message) until the
// gateway's counterpart change deploys.

const cloudError = (body: unknown) => Object.assign(new Error("x"), { body });
const localError = (text: string) =>
  Object.assign(new Error("x"), { body: text });

describe("isToolkitOauthUnavailableError", () => {
  it("matches the typed code on a parsed cloud error body", () => {
    strictEqual(
      isToolkitOauthUnavailableError(
        cloudError({ error: "…", code: "toolkit_oauth_unavailable" }),
      ),
      true,
    );
  });

  it("matches the typed code on a raw local error body", () => {
    strictEqual(
      isToolkitOauthUnavailableError(
        localError(
          JSON.stringify({ error: "…", code: "toolkit_oauth_unavailable" }),
        ),
      ),
      true,
    );
  });

  it("matches the legacy gateway 500 shape via its detail marker", () => {
    strictEqual(
      isToolkitOauthUnavailableError(
        localError(
          JSON.stringify({
            detail:
              'composio: toolkit "highlevel" only offers OAuth and Composio has no managed app for it — register a developer OAuth app for it in the Composio dashboard, then connecting will reuse that auth config',
            error: "integrations route failed",
          }),
        ),
      ),
      true,
    );
  });

  it("rejects other typed codes", () => {
    strictEqual(
      isToolkitOauthUnavailableError(
        cloudError({ error: "…", code: "toolkit_no_auth" }),
      ),
      false,
    );
  });

  it("rejects other gateway 500 details", () => {
    strictEqual(
      isToolkitOauthUnavailableError(
        localError(
          JSON.stringify({
            detail: "composio POST /api/v3/auth_configs → 500: upstream hiccup",
            error: "integrations route failed",
          }),
        ),
      ),
      false,
    );
  });

  it("rejects unparseable bodies, bodyless errors, and non-objects", () => {
    strictEqual(isToolkitOauthUnavailableError(localError("<html>")), false);
    strictEqual(isToolkitOauthUnavailableError(new Error("x")), false);
    strictEqual(isToolkitOauthUnavailableError(null), false);
    strictEqual(
      isToolkitOauthUnavailableError("toolkit_oauth_unavailable"),
      false,
    );
  });
});
