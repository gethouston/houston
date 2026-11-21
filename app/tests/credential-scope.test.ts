import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  credentialScopeOf,
  statusCredentialScope,
} from "../src/lib/credential-scope.ts";
import { withAccountLabel } from "../src/lib/model-picker.ts";

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
