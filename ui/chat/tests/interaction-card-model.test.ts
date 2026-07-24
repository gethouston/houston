import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { humanizeActionGerund } from "../src/interaction-card-model.ts";

// The process-block header's branded row narrates an integration action in
// present tense. The verb becomes its gerund; the toolkit prefix is stripped
// (including multi-word toolkits); an unmapped verb is capitalized, never
// mis-conjugated.
describe("humanizeActionGerund", () => {
  it("strips the toolkit prefix and gerund-izes the verb", () => {
    strictEqual(
      humanizeActionGerund("GMAIL_SEND_EMAIL", "gmail"),
      "Sending email",
    );
    strictEqual(
      humanizeActionGerund("SLACK_POST_MESSAGE", "slack"),
      "Posting message",
    );
    strictEqual(
      humanizeActionGerund("NOTION_CREATE_PAGE", "notion"),
      "Creating page",
    );
  });

  it("handles multi-word toolkits (longest-prefix already resolved)", () => {
    strictEqual(
      humanizeActionGerund("GOOGLE_MAPS_SEARCH_PLACES", "google_maps"),
      "Searching places",
    );
  });

  it("falls back to a capitalized de-underscored remainder for an unmapped verb", () => {
    strictEqual(
      humanizeActionGerund("GMAIL_SYNC_CONTACTS", "gmail"),
      "Sync contacts",
    );
  });

  it("humanizes the whole slug when it lacks the toolkit prefix", () => {
    strictEqual(humanizeActionGerund("SEND_EMAIL", "gmail"), "Sending email");
    strictEqual(humanizeActionGerund("SEND_EMAIL", ""), "Sending email");
  });

  it("falls back to the prettified slug when the action is all prefix", () => {
    strictEqual(humanizeActionGerund("GMAIL", "gmail"), "Gmail");
    strictEqual(humanizeActionGerund("GMAIL_", "gmail"), "Gmail");
  });

  it("lowercases trailing words after a mapped or unmapped verb", () => {
    strictEqual(
      humanizeActionGerund("HUBSPOT_GET_CONTACT_BY_ID", "hubspot"),
      "Getting contact by id",
    );
  });
});
