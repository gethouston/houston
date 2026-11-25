import { describe, expect, test } from "vitest";
import {
  classifyIntegrationFailure,
  failureClassGuidance,
  toolkitForAction,
} from "./integrations-failure-class";

/**
 * Refusal bodies from 72 h of production Composio logs (2026-11-15 to 11-18),
 * scrubbed: ids, emails, file names and project numbers replaced. Each is the
 * `error` string the integration_execute tool receives verbatim.
 */
const BODY = {
  slackFeature: "Slack API error: feature_not_enabled",
  apifyJson:
    '{\n  "error": {\n    "type": "<id>",\n    "message": "User was not found or authentication token is not valid"\n  }\n}',
  apify401:
    "API request failed with status 401: User was not found or authentication token is not valid",
  odoo: '{"name": "werkzeug.exceptions.Unauthorized", "message": "Invalid apikey", "arguments": ["Invalid apikey", 401], "context": {}, "debug": "Traceback (most recent call last):\\n  File \\"/home/odoo/src/odoo/19.0/odoo/http.py\\", line 2409, in _serve_db"}',
  facebook:
    '{"error":{"message":"Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.","type":"OAuthException","code":190,"error_subcode":460,"fbtrace_id":"<id>"}}',
  googleCalendar401:
    '{\n  "error": {\n    "code": 401,\n    "message": "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",\n    "status": "UNAUTHENTICATED"\n  }\n}',
  notionQuery:
    'Notion API HTTP error 404: {"object":"error","status":404,"code":"object_not_found","message":"Could not find database with ID: <uuid>. Make sure the relevant pages and databases are shared with your integration \\"Composio\\".","request_id":"<uuid>"}',
  notionPage:
    'Page not found (404): Could not find page with ID: <uuid>. Make sure the relevant pages and databases are shared with your integration "Composio".. Ensure the page exists and is shared with your integration.',
  notionInsert:
    "Database with ID '<uuid>' could not be found. This typically happens for one of two reasons:\n\n1. The database_id is invalid or does not exist in Notion\n2. The database exists but has not been shared with your integration",
  notionDataSource:
    "Notion API error (validation_error): Database with ID <uuid> does not contain any data sources accessible by this API bot.",
  apolloPlan:
    'Apollo API request failed (HTTP 403): {"error":"The api/v1/people/match API is not included in your Free plan and is not accessible. All paid plans include full API access.","error_code":"API_INACCESSIBLE"}',
  linearLimit:
    "Message: usage limit exceeded | Code: <id> | Path: issueCreate | Details: You've exceeded the free issue limit for this workspace. Please upgrade or contact support for a free trial.",
} as const;

/** Real refusals a retry or a different input CAN fix: never classified. */
const RETRYABLE = {
  sheetsQuota:
    "API Error: Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute' of service 'sheets.googleapis.com' for consumer 'project_number:<n>'.",
  airtableOffset:
    "Pagination offset expired: The offset '<id>' is no longer valid. Airtable pagination tokens are temporary and expire after a short period.",
  driveNotFound:
    'File with ID \'<id>\' not found. The API response is: {"error": {"code": 404, "message": "File not found: <id>.", "errors": [{"reason": "notFound"}]}}',
  xeroForbidden:
    'Failed to retrieve Profit & Loss report. API response: {"Type":null,"Title":"Forbidden","Status":403}',
  adsPermission:
    "The caller does not have permission. User doesn't have permission to access customer. Note: If you're accessing a client customer, the manager's customer id must be set in the 'login-customer-id' header.",
  notionProperty:
    'Notion API HTTP error 400: {"object":"error","status":400,"code":"validation_error","message":"Could not find property with name or id: Nombre"}',
  granolaRate:
    'MCP tool error: Rate limit reached for this account (shared by all its sessions). Wait at least 1 second before retrying this tool.\n{"error":{"code":"rate_limit","reason":"exhausted","retryable":true}}',
  telegramChat:
    '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}',
  inputShape:
    "Invalid request data provided\n- Input should be a valid string on parameter `team_Id`",
} as const;

describe("classifyIntegrationFailure", () => {
  test.each([
    ["apify", BODY.apifyJson],
    ["apify", BODY.apify401],
    ["odoo", BODY.odoo],
    ["facebook", BODY.facebook],
    ["googlecalendar", BODY.googleCalendar401],
  ])(
    "%s dead login → needs_reconnect carrying the toolkit",
    (toolkit, body) => {
      expect(classifyIntegrationFailure(body, toolkit)).toEqual({
        kind: "needs_reconnect",
        toolkit,
      });
    },
  );

  test.each([
    BODY.notionQuery,
    BODY.notionPage,
    BODY.notionInsert,
    BODY.notionDataSource,
  ])("Notion unshared page → not_shared (%#)", (body) => {
    expect(classifyIntegrationFailure(body, "notion")).toEqual({
      kind: "not_shared",
      toolkit: "notion",
    });
  });

  test.each([
    ["slack", BODY.slackFeature],
    ["apollo", BODY.apolloPlan],
    ["linear", BODY.linearLimit],
  ])("%s missing feature or plan → not_available", (toolkit, body) => {
    expect(classifyIntegrationFailure(body, toolkit)).toEqual({
      kind: "not_available",
      toolkit,
    });
  });

  test.each(Object.entries(RETRYABLE))(
    "%s stays unclassified (a retry or new input can fix it)",
    (_name, body) => {
      expect(classifyIntegrationFailure(body, "any")).toBeUndefined();
    },
  );
});

describe("toolkitForAction", () => {
  test("prefers the toolkit integration_search reported", () => {
    const known = new Map([["HIGHLEVEL_MCP_SEND", "highlevel_mcp"]]);
    expect(toolkitForAction("HIGHLEVEL_MCP_SEND", known)).toEqual({
      toolkit: "highlevel_mcp",
      known: true,
    });
  });

  test("falls back to the slug's first segment, marked as a guess", () => {
    expect(toolkitForAction("MICROSOFT_TEAMS_SEND_MESSAGE", new Map())).toEqual(
      { toolkit: "microsoft", known: false },
    );
  });
});

describe("failureClassGuidance", () => {
  test("needs_reconnect: no retry of the app, the card is queued, end the turn", () => {
    const text = failureClassGuidance(
      { kind: "needs_reconnect", toolkit: "apify" },
      "APIFY_ACT_RUNS_LAST_GET",
    );
    expect(text).toContain("do not call any apify action again");
    expect(text).toContain("A reconnect step for apify was added");
    expect(text).toContain("end your turn");
  });

  test("needs_reconnect without a card: the Integrations page, never in chat", () => {
    const text = failureClassGuidance(
      { kind: "needs_reconnect", toolkit: "apify" },
      "APIFY_ACT_RUNS_LAST_GET",
      "integrations_page",
    );
    expect(text).toContain("do not call any apify action again");
    expect(text).toContain("Integrations page");
    expect(text).toContain("Do not ask to connect it in chat");
    expect(text).not.toContain("A reconnect step");
  });

  test("Slack assistant search points at SLACK_SEARCH_MESSAGES", () => {
    const text = failureClassGuidance(
      { kind: "not_available", toolkit: "slack" },
      "SLACK_ASSISTANT_SEARCH_CONTEXT",
    );
    expect(text).toContain("Do not call SLACK_ASSISTANT_SEARCH_CONTEXT again");
    expect(text).toContain("use SLACK_SEARCH_MESSAGES instead");
  });

  test("other missing features: no retry, another way or tell the user", () => {
    const text = failureClassGuidance(
      { kind: "not_available", toolkit: "apollo" },
      "APOLLO_PEOPLE_ENRICHMENT",
    );
    expect(text).toContain("Do not retry it");
    expect(text).toContain("plan does not include this");
    expect(text).not.toContain("SLACK_SEARCH_MESSAGES");
  });

  test("Notion: do not retry the id, ask the user to share the page", () => {
    const text = failureClassGuidance(
      { kind: "not_shared", toolkit: "notion" },
      "NOTION_QUERY_DATABASE_WITH_FILTER",
    );
    expect(text).toContain("Do not retry the same id");
    expect(text).toContain("choose Connections and add Composio");
  });
});

test("insufficient scopes are left unclassified (a separate missing-permission hint owns them)", () => {
  expect(
    classifyIntegrationFailure(
      'Error finding files: 403. {"error": {"code": 403, "message": "Request had insufficient authentication scopes."}}',
      "googledrive",
    ),
  ).toBeUndefined();
});
