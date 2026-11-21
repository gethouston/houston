import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  preferredProvider,
  resolveEffectiveProvider,
} from "../src/components/chat-effective-provider.ts";

describe("preferredProvider", () => {
  it("takes the strongest evidence first", () => {
    strictEqual(preferredProvider("openai", "anthropic", "gemini"), "openai");
    strictEqual(preferredProvider(null, "anthropic", "gemini"), "anthropic");
    strictEqual(preferredProvider(null, null, "gemini"), "gemini");
  });

  it("returns null with no evidence at all", () => {
    strictEqual(preferredProvider(null, null, null), null);
  });

  it("treats an empty string as absent, not as a pick", () => {
    strictEqual(preferredProvider("", "anthropic", null), "anthropic");
    strictEqual(preferredProvider("", "", "gemini"), "gemini");
    strictEqual(preferredProvider("", "", ""), null);
  });
});

describe("resolveEffectiveProvider", () => {
  it("uses an explicit (activity/agent) provider for a fresh chat when it is connected", () => {
    strictEqual(
      resolveEffectiveProvider(
        "anthropic",
        null,
        "openai",
        ["anthropic", "openai"],
        false,
      ),
      "anthropic",
    );
    strictEqual(
      resolveEffectiveProvider(
        null,
        "anthropic",
        null,
        ["anthropic", "openai"],
        false,
      ),
      "anthropic",
    );
  });

  it("does NOT default a fresh chat onto a configured-but-logged-out provider", () => {
    strictEqual(
      resolveEffectiveProvider("openai", null, null, ["openrouter"], false),
      "openrouter",
    );
    strictEqual(
      resolveEffectiveProvider(null, "openai", "openai", ["openrouter"], false),
      "openrouter",
    );
  });

  it("prefers the activity provider over the agent provider", () => {
    strictEqual(
      resolveEffectiveProvider(
        "openai",
        "anthropic",
        null,
        ["anthropic", "openai"],
        false,
      ),
      "openai",
    );
  });

  it("auth-gates the no-config fallback to the preferred provider when logged in", () => {
    strictEqual(
      resolveEffectiveProvider(
        null,
        null,
        "openai",
        ["anthropic", "openai"],
        false,
      ),
      "openai",
    );
  });

  it("auth-switches the no-config fallback off a logged-out preference (#483)", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, "anthropic", ["openai"], false),
      "openai",
    );
  });

  it("picks the sole authed provider for the fallback when there is no preference", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, null, ["openai"], false),
      "openai",
    );
  });

  it("ignores an empty-string activity provider and uses the next evidence", () => {
    strictEqual(
      resolveEffectiveProvider("", "openai", null, ["openai"], true),
      "openai",
    );
    strictEqual(resolveEffectiveProvider("", "", "", [], true), "anthropic");
  });

  it("keeps the preferred fallback when statuses haven't loaded (empty)", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, "openai", [], false),
      "openai",
    );
    strictEqual(
      resolveEffectiveProvider(null, null, null, [], false),
      "anthropic",
    );
  });
});

describe("resolveEffectiveProvider — frozen once a conversation has messages", () => {
  it("does NOT switch an in-progress chat to another connected provider when its own logs out", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, "openai", ["openrouter"], true),
      "openai",
    );
  });

  it("freezes to the preferred provider even when others are connected", () => {
    strictEqual(
      resolveEffectiveProvider(
        null,
        null,
        "openai",
        ["openai", "openrouter"],
        true,
      ),
      "openai",
    );
  });

  it("a fresh (message-less) composer still auth-switches off a logged-out preference", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, "openai", ["openrouter"], false),
      "openrouter",
    );
  });

  it("still honors an explicit provider with messages (explicit wins over the freeze)", () => {
    strictEqual(
      resolveEffectiveProvider(
        "openai",
        null,
        "anthropic",
        ["anthropic"],
        true,
      ),
      "openai",
    );
  });

  it("honors an explicit activity provider as-is on a frozen chat, even when logged out", () => {
    strictEqual(
      resolveEffectiveProvider("anthropic", null, "openai", ["openai"], true),
      "anthropic",
    );
  });

  it("honors an explicit agent provider as-is on a frozen chat, even when logged out", () => {
    strictEqual(
      resolveEffectiveProvider(null, "anthropic", null, ["openai"], true),
      "anthropic",
    );
  });
});

describe("resolveEffectiveProvider — an UNCONFIRMABLE probe defers (HOU-979)", () => {
  it("does NOT auth-switch away from a preferred provider we could not confirm", () => {
    strictEqual(
      resolveEffectiveProvider(null, "anthropic", null, ["openrouter"], false, [
        "anthropic",
      ]),
      "anthropic",
    );
  });

  it("still auth-switches off a CONFIRMED logged-out preference", () => {
    strictEqual(
      resolveEffectiveProvider(null, "openai", null, ["openrouter"], false, [
        "deepseek",
      ]),
      "openrouter",
    );
  });

  it("never picks an unconfirmable provider as the FALLBACK", () => {
    strictEqual(
      resolveEffectiveProvider(null, "openai", null, [], false, ["openrouter"]),
      "openai",
    );
  });
});
