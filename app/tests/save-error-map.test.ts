import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  avatarErrorKey,
  HANDLE_ERROR_KEYS,
  saveErrorKey,
} from "../src/components/store-view/profile/save-error-map.ts";

describe("HANDLE_ERROR_KEYS", () => {
  it("maps every handle token to its field message key", () => {
    strictEqual(HANDLE_ERROR_KEYS.handle_taken, "profile.handleTaken");
    strictEqual(HANDLE_ERROR_KEYS.handle_reserved, "profile.handleReserved");
    strictEqual(HANDLE_ERROR_KEYS.invalid_handle, "profile.handleInvalid");
    strictEqual(
      HANDLE_ERROR_KEYS.handle_change_too_soon,
      "profile.handleChangeTooSoon",
    );
  });

  it("has no entry for a non-handle token", () => {
    strictEqual(HANDLE_ERROR_KEYS.bio_too_long, undefined);
  });
});

describe("saveErrorKey", () => {
  it("maps every known non-handle save token to its specific key", () => {
    strictEqual(saveErrorKey("bio_too_long"), "profile.bioTooLong");
    strictEqual(saveErrorKey("invalid_link"), "profile.invalidLink");
    strictEqual(
      saveErrorKey("display_name_required"),
      "profile.displayNameRequired",
    );
    strictEqual(saveErrorKey("user_not_found"), "profile.saveFailedAccount");
  });

  it("falls back to the generic save copy for null (network/session)", () => {
    strictEqual(saveErrorKey(null), "profile.saveFailed");
  });

  it("falls back to the generic save copy for an unknown token (500)", () => {
    strictEqual(saveErrorKey("gateway error"), "profile.saveFailed");
    strictEqual(saveErrorKey("no_profile"), "profile.saveFailed");
  });
});

describe("avatarErrorKey", () => {
  it("reuses the claim hint for a not-yet-saved profile", () => {
    strictEqual(avatarErrorKey("no_profile"), "profile.avatarClaimHint");
  });

  it("maps the size token to the too-large copy", () => {
    strictEqual(avatarErrorKey("image_too_large"), "profile.avatarTooLarge");
  });

  it("maps every type/format token to the bad-type copy", () => {
    strictEqual(
      avatarErrorKey("unsupported_media_type"),
      "profile.avatarBadType",
    );
    strictEqual(avatarErrorKey("invalid_image"), "profile.avatarBadType");
    strictEqual(avatarErrorKey("no_file"), "profile.avatarBadType");
  });

  it("falls back to a photo-specific generic, never the save copy", () => {
    strictEqual(avatarErrorKey(null), "profile.avatarFailed");
    strictEqual(avatarErrorKey("gateway error"), "profile.avatarFailed");
    strictEqual(
      avatarErrorKey("some_rate_limit_token"),
      "profile.avatarFailed",
    );
  });
});
