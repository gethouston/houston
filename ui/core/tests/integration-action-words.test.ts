import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { actionWordsWithoutToolkit } from "../src/integration-action-words.ts";

describe("actionWordsWithoutToolkit", () => {
  it("drops a single-word toolkit prefix", () => {
    deepStrictEqual(actionWordsWithoutToolkit("GMAIL_SEND_EMAIL", "gmail"), [
      "SEND",
      "EMAIL",
    ]);
  });

  it("drops a multi-word toolkit however either side spells it", () => {
    for (const toolkit of ["googlemaps", "google_maps", "Google Maps"]) {
      deepStrictEqual(
        actionWordsWithoutToolkit("GOOGLE_MAPS_SEARCH", toolkit),
        ["SEARCH"],
      );
    }
  });

  it("keeps every word when the slug carries no toolkit prefix", () => {
    deepStrictEqual(actionWordsWithoutToolkit("SEND_EMAIL", "gmail"), [
      "SEND",
      "EMAIL",
    ]);
    deepStrictEqual(actionWordsWithoutToolkit("NOTION_CREATE_PAGE", ""), [
      "NOTION",
      "CREATE",
      "PAGE",
    ]);
  });

  it("keeps a word that merely starts like the toolkit", () => {
    deepStrictEqual(actionWordsWithoutToolkit("SLACKBOT_PING", "slack"), [
      "SLACKBOT",
      "PING",
    ]);
  });

  it("is empty when the slug is nothing but the toolkit", () => {
    deepStrictEqual(actionWordsWithoutToolkit("GMAIL", "gmail"), []);
    deepStrictEqual(actionWordsWithoutToolkit("GMAIL_", "gmail"), []);
  });

  it("has no words for a slug made of separators", () => {
    deepStrictEqual(actionWordsWithoutToolkit("___", "gmail"), []);
    deepStrictEqual(actionWordsWithoutToolkit("", "gmail"), []);
  });
});
