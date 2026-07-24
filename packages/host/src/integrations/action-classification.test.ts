import { expect, test } from "vitest";
import { isReadOnlyAction } from "./action-classification";

/**
 * The slug-verb read/write classifier: a read verb with no write verb is
 * read-only (runs ungated); everything ambiguous — no verb, or a read verb
 * mixed with a write verb — is NOT read-only, so it still shows the card.
 */

test("real read slugs classify as read-only", () => {
  expect(isReadOnlyAction("GMAIL_FETCH_EMAILS")).toBe(true);
  expect(isReadOnlyAction("SLACK_LIST_CHANNELS")).toBe(true);
  expect(isReadOnlyAction("ACTIVE_CAMPAIGN_GET_CAMPAIGN_BY_ID")).toBe(true);
  expect(isReadOnlyAction("NOTION_SEARCH_NOTION_PAGE")).toBe(true);
  expect(isReadOnlyAction("GOOGLECALENDAR_FIND_EVENT")).toBe(true);
});

test("real write/risky slugs are NOT read-only", () => {
  expect(isReadOnlyAction("GMAIL_SEND_EMAIL")).toBe(false);
  expect(isReadOnlyAction("GMAIL_CREATE_EMAIL_DRAFT")).toBe(false);
  expect(isReadOnlyAction("NOTION_CREATE_PAGE")).toBe(false);
  expect(isReadOnlyAction("TWITTER_POST_TWEET")).toBe(false);
});

test("a slug with two write verbs (MOVE + TRASH) is not read-only", () => {
  expect(isReadOnlyAction("GMAIL_MOVE_TO_TRASH")).toBe(false);
});

test("a read verb mixed with a write verb loses — RUN beats GET", () => {
  // Conservative: any write segment disqualifies, even alongside a read.
  expect(isReadOnlyAction("APIFY_ACT_RUN_SYNC_GET_DATASET_ITEMS_GET")).toBe(
    false,
  );
});

test("a read-verb NOUN collision cannot launder a mutation", () => {
  // LIST/CHECK/VIEW appear as nouns beside mutating verbs; the mutating verb
  // must disqualify the slug even though a "read verb" segment is present.
  expect(isReadOnlyAction("MAILCHIMP_SUBSCRIBE_TO_LIST")).toBe(false);
  expect(isReadOnlyAction("TWITTER_FOLLOW_LIST")).toBe(false);
  expect(isReadOnlyAction("TRELLO_ATTACH_FILE_TO_CHECK_ITEM")).toBe(false);
});

test("a slug with no verb segment is not read-only", () => {
  expect(isReadOnlyAction("GMAIL")).toBe(false);
});

test("the empty string is not read-only", () => {
  expect(isReadOnlyAction("")).toBe(false);
});

test("classification is case-insensitive", () => {
  expect(isReadOnlyAction("gmail_fetch_emails")).toBe(true);
  expect(isReadOnlyAction("gmail_send_email")).toBe(false);
});
