import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { identityHeaderFace } from "../src/components/settings/identity-header-model.ts";

/**
 * The Settings index opens on the signed-in person: face, name, email, Sign
 * out. It is the app's ONE identity control now that the rail's avatar menu is
 * gone, so what it prints has to be right in every shape the session comes in.
 */
describe("identityHeaderFace", () => {
  it("keeps the email as the second line when it is a real second fact", () => {
    assert.deepEqual(
      identityHeaderFace({
        name: "Ada Lovelace",
        email: "ada@example.com",
        avatarUrl: "https://example.com/ada.png",
      }),
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        avatarUrl: "https://example.com/ada.png",
      },
    );
  });

  it("drops the email when it IS the name", () => {
    // `resolveMyProfile` falls back name > email > id, so anyone who never set
    // a display name arrives here with both fields holding the same address.
    // Printing it twice, once bold and once muted, reads as a rendering bug.
    const face = identityHeaderFace({
      name: "ada@example.com",
      email: "ada@example.com",
    });
    assert.equal(face.name, "ada@example.com");
    assert.equal(face.email, null);
  });

  it("drops a blank or whitespace email rather than draw an empty line", () => {
    assert.equal(identityHeaderFace({ name: "Ada", email: "" }).email, null);
    assert.equal(identityHeaderFace({ name: "Ada", email: "  " }).email, null);
    assert.equal(identityHeaderFace({ name: "Ada", email: null }).email, null);
    assert.equal(identityHeaderFace({ name: "Ada" }).email, null);
  });

  it("trims both fields, so padding never fakes a difference", () => {
    const face = identityHeaderFace({
      name: "  ada@example.com  ",
      email: " ada@example.com ",
    });
    assert.equal(face.name, "ada@example.com");
    assert.equal(face.email, null);
  });

  it("normalizes a missing photo to null, so the header renders initials", () => {
    assert.equal(identityHeaderFace({ name: "Ada" }).avatarUrl, null);
    assert.equal(
      identityHeaderFace({ name: "Ada", avatarUrl: null }).avatarUrl,
      null,
    );
  });
});
