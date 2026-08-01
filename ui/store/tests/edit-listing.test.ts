import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  listingDraftOf,
  listingDraftValid,
  listingIdentityOf,
  MAX_LISTING_TAGS,
  normalizeListingTags,
} from "../src/index.ts";
import type { OwnedAgentRow } from "../src/types.ts";

const agent: OwnedAgentRow = {
  id: "a1",
  slug: "inbox-zero",
  name: "Inbox Zero",
  tagline: "Your inbox, handled",
  description: "Clears your inbox.",
  category: "productivity",
  tags: ["email", "email", " inbox "],
  integrations: [],
  creator: { displayName: "Felipe" },
  installsCount: 3,
  state: "published",
  visibility: "public",
};

describe("listingDraftOf", () => {
  it("seeds every editable field from the row", () => {
    assert.deepEqual(listingDraftOf(agent), {
      name: "Inbox Zero",
      tagline: "Your inbox, handled",
      description: "Clears your inbox.",
      category: "productivity",
      tags: ["email", "inbox"],
    });
  });

  it("maps absent optionals to empty strings and arrays", () => {
    const draft = listingDraftOf({
      ...agent,
      tagline: null,
      category: undefined,
      tags: undefined,
    });
    assert.equal(draft.tagline, "");
    assert.equal(draft.category, "");
    assert.deepEqual(draft.tags, []);
  });
});

describe("normalizeListingTags", () => {
  it("trims, drops blanks, de-dupes case-insensitively, caps", () => {
    assert.deepEqual(normalizeListingTags([" a ", "", "A", "b"]), ["a", "b"]);
    const many = Array.from({ length: 10 }, (_v, i) => `t${i}`);
    assert.equal(normalizeListingTags(many).length, MAX_LISTING_TAGS);
  });
});

describe("listingDraftValid", () => {
  it("requires name, description, and category", () => {
    const draft = listingDraftOf(agent);
    assert.equal(listingDraftValid(draft), true);
    assert.equal(listingDraftValid({ ...draft, name: "  " }), false);
    assert.equal(listingDraftValid({ ...draft, description: "" }), false);
    assert.equal(listingDraftValid({ ...draft, category: "" }), false);
  });
});

describe("listingIdentityOf", () => {
  it("trims values and keeps a cleared tagline as empty", () => {
    assert.deepEqual(
      listingIdentityOf({
        name: " Inbox Zero ",
        tagline: "  ",
        description: " Clears it. ",
        category: "productivity",
        tags: ["Email", "email"],
      }),
      {
        name: "Inbox Zero",
        tagline: "",
        description: "Clears it.",
        category: "productivity",
        tags: ["Email"],
      },
    );
  });
});
