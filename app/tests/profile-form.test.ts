import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { CreatorProfile } from "@houston-ai/engine-client";
import {
  buildProfilePatch,
  canSaveProfile,
  hasInvalidLink,
  isValidHttpsUrl,
  linksEqual,
} from "../src/components/store-view/profile/profile-form.ts";

function profile(over: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    handle: "ana",
    displayName: "Ana",
    bio: "builds things",
    avatarUrl: null,
    verified: false,
    links: { github: "https://github.com/ana" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("isValidHttpsUrl", () => {
  it("accepts an empty value (the field is optional)", () => {
    strictEqual(isValidHttpsUrl(""), true);
    strictEqual(isValidHttpsUrl("   "), true);
  });

  it("accepts a well-formed https URL", () => {
    strictEqual(isValidHttpsUrl("https://x.com/ana"), true);
  });

  it("rejects http, other schemes, and junk", () => {
    strictEqual(isValidHttpsUrl("http://x.com/ana"), false);
    strictEqual(isValidHttpsUrl("javascript:alert(1)"), false);
    strictEqual(isValidHttpsUrl("mailto:a@b.co"), false);
    strictEqual(isValidHttpsUrl("not a url"), false);
  });
});

describe("hasInvalidLink", () => {
  it("is false when every present link is https", () => {
    strictEqual(
      hasInvalidLink({ x: "https://x.com/a", website: "https://a.dev" }),
      false,
    );
  });

  it("is true when any present link is not https", () => {
    strictEqual(
      hasInvalidLink({ x: "https://x.com/a", website: "a.dev" }),
      true,
    );
  });
});

describe("linksEqual", () => {
  it("treats an absent key and an empty string as equal", () => {
    strictEqual(linksEqual({ x: "" }, {}), true);
  });

  it("detects a changed link value", () => {
    strictEqual(linksEqual({ x: "https://a" }, { x: "https://b" }), false);
  });
});

describe("buildProfilePatch", () => {
  it("omits the handle when it is unchanged (no spurious change-too-soon)", () => {
    const patch = buildProfilePatch(
      {
        handle: "ana",
        displayName: "Ana",
        bio: "new bio",
        links: { github: "https://github.com/ana" },
      },
      profile(),
    );
    deepStrictEqual(patch, { bio: "new bio" });
  });

  it("trims the display name and includes it only when changed", () => {
    const patch = buildProfilePatch(
      {
        handle: "ana",
        displayName: "  Ana Ruiz  ",
        bio: "builds things",
        links: { github: "https://github.com/ana" },
      },
      profile(),
    );
    deepStrictEqual(patch, { displayName: "Ana Ruiz" });
  });

  it("carries handle + displayName for a first claim over an unclaimed profile", () => {
    const patch = buildProfilePatch(
      {
        handle: "newbie",
        displayName: "New Bee",
        bio: "",
        links: {},
      },
      profile({ handle: null, displayName: "", bio: null, links: {} }),
    );
    deepStrictEqual(patch, { handle: "newbie", displayName: "New Bee" });
  });

  it("sends an empty bio to clear a previously set one", () => {
    const patch = buildProfilePatch(
      {
        handle: "ana",
        displayName: "Ana",
        bio: "",
        links: { github: "https://github.com/ana" },
      },
      profile(),
    );
    deepStrictEqual(patch, { bio: "" });
  });

  it("includes links only when they differ", () => {
    const patch = buildProfilePatch(
      {
        handle: "ana",
        displayName: "Ana",
        bio: "builds things",
        links: { github: "https://github.com/ana", x: "https://x.com/ana" },
      },
      profile(),
    );
    deepStrictEqual(patch, {
      links: { github: "https://github.com/ana", x: "https://x.com/ana" },
    });
  });

  it("returns an empty patch when nothing changed", () => {
    const patch = buildProfilePatch(
      {
        handle: "ana",
        displayName: "Ana",
        bio: "builds things",
        links: { github: "https://github.com/ana" },
      },
      profile(),
    );
    deepStrictEqual(patch, {});
  });
});

describe("canSaveProfile", () => {
  const base = {
    claiming: true,
    handleChanged: false,
    handleValid: false,
    displayName: "New Bee",
    links: {},
    saving: false,
  };

  it("blocks Save on the claim flow with an empty/invalid handle (no wasted round-trip)", () => {
    // Regression: an empty handle is unchanged from the null baseline, so gating
    // on handleChanged alone left Save enabled and the gateway bounced the
    // handle-less patch with invalid_handle against a blank field.
    strictEqual(
      canSaveProfile({ ...base, handleChanged: false, handleValid: false }),
      false,
    );
    strictEqual(
      canSaveProfile({ ...base, handleChanged: true, handleValid: false }),
      false,
    );
  });

  it("allows Save on the claim flow once a valid handle is present", () => {
    strictEqual(
      canSaveProfile({ ...base, handleChanged: true, handleValid: true }),
      true,
    );
  });

  it("still requires a non-empty display name on claim", () => {
    strictEqual(
      canSaveProfile({
        ...base,
        handleChanged: true,
        handleValid: true,
        displayName: "   ",
      }),
      false,
    );
  });

  it("lets an existing profile save an unchanged handle (bio-only edit)", () => {
    strictEqual(
      canSaveProfile({
        ...base,
        claiming: false,
        handleChanged: false,
        handleValid: false,
        displayName: "Ana",
      }),
      true,
    );
  });

  it("blocks an existing profile from saving a changed-but-invalid handle", () => {
    strictEqual(
      canSaveProfile({
        ...base,
        claiming: false,
        handleChanged: true,
        handleValid: false,
        displayName: "Ana",
      }),
      false,
    );
  });

  it("blocks Save on an invalid link or while a save is in flight", () => {
    strictEqual(
      canSaveProfile({
        ...base,
        handleChanged: true,
        handleValid: true,
        links: { x: "http://insecure" },
      }),
      false,
    );
    strictEqual(
      canSaveProfile({
        ...base,
        handleChanged: true,
        handleValid: true,
        saving: true,
      }),
      false,
    );
  });
});
