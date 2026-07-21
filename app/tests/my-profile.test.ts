import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  avatarUrlFromProfiles,
  resolveMyProfile,
  type UserProfile,
} from "../src/hooks/queries/user-profiles-map.ts";

describe("resolveMyProfile — avatar precedence", () => {
  it("an uploaded profile avatar WINS over the provider (Google) photo", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: { full_name: "Ana", avatar_url: "https://google/photo.jpg" },
      profile: { userId: "u1", name: "Ana", avatarUrl: "https://cdn/up.png" },
    });
    strictEqual(me.avatarUrl, "https://cdn/up.png");
  });

  it("falls back to the metadata photo when the profile has no avatar", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: { full_name: "Ana", avatar_url: "https://google/photo.jpg" },
      profile: { userId: "u1", name: "Ana", avatarUrl: null },
    });
    strictEqual(me.avatarUrl, "https://google/photo.jpg");
  });

  it("falls back to the metadata photo when there is no profile row at all", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: { avatar_url: "https://google/photo.jpg" },
      profile: null,
    });
    strictEqual(me.avatarUrl, "https://google/photo.jpg");
  });

  it("neither profile nor metadata avatar -> null (render initials only)", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: {},
      profile: { userId: "u1", name: "Ana", avatarUrl: null },
    });
    strictEqual(me.avatarUrl, null);
  });
});

describe("resolveMyProfile — name precedence", () => {
  it("profile name wins over the OAuth name", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: { full_name: "OAuth Name" },
      profile: { userId: "u1", name: "Chosen Name", avatarUrl: null },
    });
    strictEqual(me.name, "Chosen Name");
  });

  it("falls to OAuth full_name > name > email > short id", () => {
    strictEqual(
      resolveMyProfile({
        userId: "u1",
        email: "a@b.co",
        metadata: { full_name: "Full", name: "Short" },
        profile: null,
      }).name,
      "Full",
    );
    strictEqual(
      resolveMyProfile({
        userId: "u1",
        email: "a@b.co",
        metadata: { name: "Short" },
        profile: null,
      }).name,
      "Short",
    );
    strictEqual(
      resolveMyProfile({
        userId: "u1",
        email: "a@b.co",
        metadata: {},
        profile: null,
      }).name,
      "a@b.co",
    );
    strictEqual(
      resolveMyProfile({
        userId: "u1-abcdefghij",
        email: null,
        metadata: {},
        profile: null,
      }).name,
      "u1-abcde",
    );
  });

  it("a bare profile (null name) still falls back to metadata", () => {
    strictEqual(
      resolveMyProfile({
        userId: "u1",
        email: "a@b.co",
        metadata: { full_name: "OAuth Name" },
        profile: { userId: "u1", name: null, avatarUrl: "https://cdn/up.png" },
      }).name,
      "OAuth Name",
    );
  });

  it("carries the userId straight through", () => {
    deepStrictEqual(
      resolveMyProfile({
        userId: "u1",
        email: "a@b.co",
        metadata: {},
        profile: null,
      }).userId,
      "u1",
    );
  });
});

describe("resolveMyProfile — store creator profile face", () => {
  it("defaults to no handle and unverified when there is no store profile", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: {},
      profile: null,
    });
    strictEqual(me.handle, null);
    strictEqual(me.verified, false);
  });

  it("surfaces the handle and verification from the store profile", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: {},
      profile: null,
      storeProfile: {
        handle: "ana",
        avatarUrl: null,
        verified: true,
      },
    });
    strictEqual(me.handle, "ana");
    strictEqual(me.verified, true);
  });

  it("the store avatar wins over both the uploaded and provider photos", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: { avatar_url: "https://google/photo.jpg" },
      profile: { userId: "u1", name: "Ana", avatarUrl: "https://cdn/up.png" },
      storeProfile: {
        handle: "ana",
        avatarUrl: "https://cdn/store.webp",
        verified: false,
      },
    });
    strictEqual(me.avatarUrl, "https://cdn/store.webp");
  });

  it("falls back through the prior avatar chain when the store avatar is null", () => {
    const me = resolveMyProfile({
      userId: "u1",
      email: "a@b.co",
      metadata: { avatar_url: "https://google/photo.jpg" },
      profile: { userId: "u1", name: "Ana", avatarUrl: null },
      storeProfile: { handle: "ana", avatarUrl: null, verified: false },
    });
    strictEqual(me.avatarUrl, "https://google/photo.jpg");
  });
});

describe("avatarUrlFromProfiles — teammate row face resolution", () => {
  const profiles = new Map<string, UserProfile>([
    ["u1", { userId: "u1", name: "Ana", avatarUrl: "https://cdn/ana.png" }],
    ["u2", { userId: "u2", name: "Ben", avatarUrl: null }],
  ]);

  it("returns the photo when the profile resolved one", () => {
    strictEqual(avatarUrlFromProfiles(profiles, "u1"), "https://cdn/ana.png");
  });

  it("returns null for a resolved profile with no avatar (initials fallback)", () => {
    strictEqual(avatarUrlFromProfiles(profiles, "u2"), null);
  });

  it("returns null for an unresolved id (profile not loaded)", () => {
    strictEqual(avatarUrlFromProfiles(profiles, "u3"), null);
  });
});
