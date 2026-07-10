import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  AVATAR_SIZE_PX,
  AvatarValidationFailure,
  avatarObjectPath,
  cacheBustedUrl,
  MAX_AVATAR_BYTES,
  validateAvatarFile,
} from "../src/lib/profile-avatar-core.ts";

describe("validateAvatarFile", () => {
  it("accepts an image under the size cap", () => {
    strictEqual(validateAvatarFile({ type: "image/png", size: 1024 }), null);
    strictEqual(
      validateAvatarFile({ type: "image/webp", size: MAX_AVATAR_BYTES }),
      null,
    );
  });

  it("rejects a non-image type", () => {
    strictEqual(
      validateAvatarFile({ type: "application/pdf", size: 10 }),
      "not-image",
    );
    strictEqual(validateAvatarFile({ type: "", size: 10 }), "not-image");
  });

  it("rejects an image over the 5 MB cap", () => {
    strictEqual(
      validateAvatarFile({ type: "image/jpeg", size: MAX_AVATAR_BYTES + 1 }),
      "too-large",
    );
  });

  it("checks type before size (a huge non-image reads as not-image)", () => {
    strictEqual(
      validateAvatarFile({ type: "text/plain", size: MAX_AVATAR_BYTES + 1 }),
      "not-image",
    );
  });
});

describe("AvatarValidationFailure", () => {
  it("carries the reason and is an Error", () => {
    const err = new AvatarValidationFailure("too-large");
    strictEqual(err instanceof Error, true);
    strictEqual(err.reason, "too-large");
    strictEqual(err.name, "AvatarValidationFailure");
  });
});

describe("avatarObjectPath", () => {
  it("pins the uid as the first path segment", () => {
    strictEqual(avatarObjectPath("user-123", "webp"), "user-123/avatar.webp");
    strictEqual(avatarObjectPath("abc", "jpg"), "abc/avatar.jpg");
  });
});

describe("cacheBustedUrl", () => {
  it("adds ?v= when the url has no query", () => {
    strictEqual(
      cacheBustedUrl("https://cdn/avatars/u/avatar.webp", 42),
      "https://cdn/avatars/u/avatar.webp?v=42",
    );
  });

  it("adds &v= when the url already has a query", () => {
    strictEqual(
      cacheBustedUrl("https://cdn/avatar.webp?token=x", 7),
      "https://cdn/avatar.webp?token=x&v=7",
    );
  });
});

describe("constants", () => {
  it("caps at 5 MB and outputs 256px", () => {
    strictEqual(MAX_AVATAR_BYTES, 5 * 1024 * 1024);
    strictEqual(AVATAR_SIZE_PX, 256);
  });
});
