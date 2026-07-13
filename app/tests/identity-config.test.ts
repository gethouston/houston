import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appleSignInFlagEnabled,
  identityConfigured,
  resolveIdentityConfig,
} from "../src/lib/identity/config.ts";

describe("identity/config resolveIdentityConfig", () => {
  it("prefers the baked value over the dev-env fallback", () => {
    const c = resolveIdentityConfig({
      apiKey: "baked-key",
      devApiKey: "dev-key",
      projectId: "gethouston",
    });
    strictEqual(c.apiKey, "baked-key");
    strictEqual(c.projectId, "gethouston");
  });

  it("falls back to the dev-env value when the baked one is empty", () => {
    const c = resolveIdentityConfig({
      apiKey: "",
      devApiKey: "dev-key",
      devProjectId: "scratch",
      devAuthDomain: "scratch.firebaseapp.com",
    });
    strictEqual(c.apiKey, "dev-key");
    strictEqual(c.projectId, "scratch");
    strictEqual(c.authDomain, "scratch.firebaseapp.com");
  });

  it("trims surrounding whitespace on every field", () => {
    const c = resolveIdentityConfig({
      apiKey: "  k  ",
      authDomain: " d ",
      projectId: " p ",
    });
    strictEqual(c.apiKey, "k");
    strictEqual(c.authDomain, "d");
    strictEqual(c.projectId, "p");
  });
});

describe("identity/config gating (identityConfigured)", () => {
  it("is configured only with BOTH an api key and a project id", () => {
    strictEqual(
      identityConfigured({ apiKey: "k", authDomain: "d", projectId: "p" }),
      true,
    );
  });

  it("auth domain alone does not configure — api key + project id gate", () => {
    strictEqual(
      identityConfigured({ apiKey: "k", authDomain: "d", projectId: "" }),
      false,
    );
    strictEqual(
      identityConfigured({ apiKey: "", authDomain: "d", projectId: "p" }),
      false,
    );
    strictEqual(
      identityConfigured({ apiKey: "", authDomain: "", projectId: "" }),
      false,
    );
  });
});

describe("appleSignInFlagEnabled (the Continue-with-Apple gate)", () => {
  it("is OFF by default — an unconfigured build never shows the button", () => {
    strictEqual(appleSignInFlagEnabled("", ""), false);
    strictEqual(appleSignInFlagEnabled("0", ""), false);
    strictEqual(appleSignInFlagEnabled("off", ""), false);
  });

  it("truthy baked values switch it on", () => {
    for (const v of ["1", "true", "on", "yes", " TRUE "]) {
      strictEqual(appleSignInFlagEnabled(v, ""), true, v);
    }
  });

  it("the dev env is the fallback; the baked value wins", () => {
    strictEqual(appleSignInFlagEnabled("", "1"), true);
    strictEqual(appleSignInFlagEnabled("0", "1"), false);
  });
});
