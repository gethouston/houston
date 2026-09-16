import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { humanizeIntegrationAction } from "../src/integration-action.ts";

describe("humanizeIntegrationAction", () => {
  it("reads a slug as a sentence, without repeating the app", () => {
    assert.equal(
      humanizeIntegrationAction("gmail", "GMAIL_SEND_EMAIL"),
      "Send email",
    );
    assert.equal(
      humanizeIntegrationAction("googlesheets", "GOOGLESHEETS_BATCH_UPDATE"),
      "Batch update",
    );
  });

  it("strips a multi-word toolkit however either side spells it", () => {
    assert.equal(
      humanizeIntegrationAction("googlemaps", "GOOGLE_MAPS_GET_ROUTE"),
      "Get route",
    );
    assert.equal(
      humanizeIntegrationAction("google_maps", "GOOGLE_MAPS_GET_ROUTE"),
      "Get route",
    );
    // A multi-word toolkit: both this humanizer and the chat's spend the
    // shared `actionWordsWithoutToolkit`, so the prefix strips the same way.
    assert.equal(
      humanizeIntegrationAction("googlemaps", "GOOGLE_MAPS_SEARCH"),
      "Search",
    );
  });

  it("keeps every word when the slug carries no toolkit prefix", () => {
    assert.equal(
      humanizeIntegrationAction("gmail", "SEND_EMAIL"),
      "Send email",
    );
    assert.equal(
      humanizeIntegrationAction("", "NOTION_CREATE_PAGE"),
      "Notion create page",
    );
  });

  it("names the app rather than nothing when the slug is all prefix", () => {
    assert.equal(humanizeIntegrationAction("gmail", "GMAIL"), "Gmail");
  });

  it("keeps a word that merely starts like the toolkit", () => {
    assert.equal(
      humanizeIntegrationAction("slack", "SLACKBOT_PING"),
      "Slackbot ping",
    );
  });

  it("has nothing to say when the step named no action", () => {
    assert.equal(humanizeIntegrationAction("gmail", null), null);
    assert.equal(humanizeIntegrationAction("gmail", "   "), null);
    assert.equal(humanizeIntegrationAction("gmail", "___"), null);
  });
});
