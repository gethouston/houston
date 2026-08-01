import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  credentialScopeOf,
  statusCredentialScope,
} from "../src/lib/credential-scope.ts";
import { withAccountLabel } from "../src/lib/model-picker.ts";

/**
 * HOU-976 — per-user AI accounts, decision by decision.
 *
 * In a TEAM space every turn runs on the AI account of the person who sent it;
 * there is no shared team AI account, and no client-side scope to address. What
 * survives on this side is READING the server's verdict so a surface can label
 * the account honestly — that is all these helpers do.
 *
 * The invariant every case below defends: ABSENCE IS THE OLD WORLD. The scope
 * is omitted whenever a turn or request carried no acting identity (desktop,
 * self-host, a personal space, a routine), and each helper must then produce
 * exactly the behavior that shipped before this feature — one account, nothing
 * to disambiguate, no new chrome.
 */

describe("credentialScopeOf", () => {
  it("passes the two real scopes through", () => {
    assert.equal(credentialScopeOf({ scope: "personal" }), "personal");
    assert.equal(credentialScopeOf({ scope: "team" }), "team");
  });

  it("null whenever the deployment never said", () => {
    assert.equal(credentialScopeOf(undefined), null);
    assert.equal(credentialScopeOf({}), null);
  });
});

describe("statusCredentialScope", () => {
  it("reads the PROBE's field name, which is not the wire sidecar's", () => {
    // A `ProviderStatus` spells it `credentialScope`. Handing one to
    // `credentialScopeOf` (which reads `scope`) type-checks — every field of
    // CredentialContext is optional — and then answers null forever.
    assert.equal(
      statusCredentialScope({ credentialScope: "personal" }),
      "personal",
    );
    assert.equal(statusCredentialScope({ credentialScope: "team" }), "team");
  });

  it("null whenever the probe never said", () => {
    assert.equal(statusCredentialScope(undefined), null);
    assert.equal(statusCredentialScope({}), null);
  });
});

describe("withAccountLabel (picker row subtitle)", () => {
  it("appends the account after the model's own description", () => {
    // Model first, provenance as the qualifier.
    assert.equal(
      withAccountLabel("Best for complex work", "your account"),
      "Best for complex work · your account",
    );
  });

  it("a description-less row shows the account alone", () => {
    assert.equal(withAccountLabel("", "team account"), "team account");
  });

  it("no label leaves the subtitle verbatim", () => {
    assert.equal(
      withAccountLabel("Best for complex work", undefined),
      "Best for complex work",
    );
    assert.equal(withAccountLabel("", undefined), "");
  });
});
