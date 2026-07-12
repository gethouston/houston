import { expect, test } from "vitest";
import {
  executeOutcome,
  hubPayload,
  isHubToolset,
  manageResults,
  searchSlugs,
  toAppConnections,
  toolkitOfSlug,
} from "./hub-wire";

// Trimmed copies of LIVE connect.composio.dev replies (2026-07-10), so these
// parsers are pinned to the real wire, not to wishful shapes.
const wrap = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify({ data, error: null }) }],
});

test("hub detection requires the full meta-tool trio", () => {
  expect(
    isHubToolset([
      "COMPOSIO_MANAGE_CONNECTIONS",
      "COMPOSIO_SEARCH_TOOLS",
      "COMPOSIO_MULTI_EXECUTE_TOOL",
      "COMPOSIO_REMOTE_BASH_TOOL",
    ]),
  ).toBe(true);
  expect(isHubToolset(["COMPOSIO_SEARCH_TOOLS", "echo"])).toBe(false);
});

test("manage list: active accounts become connections; initiated ones do not", () => {
  const states = manageResults(
    hubPayload(
      wrap({
        results: {
          gmail: {
            toolkit: "gmail",
            status: "active",
            accounts: [{ id: "gmail_x", status: "active", is_default: true }],
          },
          slack: { toolkit: "slack", status: "initiated", accounts: [] },
        },
      }),
    ),
  );
  expect(states).toHaveLength(2);
  expect(toAppConnections(states)).toEqual([
    { toolkit: "gmail", connectionId: "app:gmail", status: "active" },
  ]);
  expect(states.find((s) => s.toolkit === "gmail")?.accountIds).toEqual([
    "gmail_x",
  ]);
});

test("manage add: the browser hand-off rides redirect_url", () => {
  const states = manageResults(
    hubPayload(
      wrap({
        results: {
          notion: {
            toolkit: "notion",
            status: "initiated",
            redirect_url: "https://connect.composio.dev/link/lk_abc",
          },
        },
      }),
    ),
  );
  expect(states[0]?.redirectUrl).toBe(
    "https://connect.composio.dev/link/lk_abc",
  );
});

test("search slugs: primary before related, deduped", () => {
  const slugs = searchSlugs(
    hubPayload(
      wrap({
        results: [
          {
            primary_tool_slugs: ["SLACK_SEND_MESSAGE"],
            related_tool_slugs: ["SLACK_FIND_CHANNELS", "SLACK_SEND_MESSAGE"],
          },
        ],
      }),
    ),
  );
  expect(slugs).toEqual(["SLACK_SEND_MESSAGE", "SLACK_FIND_CHANNELS"]);
  expect(toolkitOfSlug("SLACK_SEND_MESSAGE")).toBe("slack");
});

test("execute: success unwraps the per-tool response", () => {
  const out = executeOutcome(
    hubPayload(
      wrap({
        results: [
          {
            response: { successful: true, data: { emailAddress: "a@b.c" } },
            tool_slug: "GMAIL_GET_PROFILE",
            index: 0,
          },
        ],
      }),
    ),
    "GMAIL_GET_PROFILE",
  );
  expect(out).toEqual({
    successful: true,
    data: { emailAddress: "a@b.c" },
  });
});

test("execute: a no-active-connection error is reworded to trigger the connect card", () => {
  const out = executeOutcome(
    hubPayload(
      wrap({
        results: [
          {
            error:
              "No active connection found for toolkit(s) 'slack' in this session. To fix this, call COMPOSIO_MANAGE_CONNECTIONS...",
            tool_slug: "SLACK_SEND_MESSAGE",
            index: 0,
          },
        ],
      }),
    ),
    "SLACK_SEND_MESSAGE",
  );
  expect(out.successful).toBe(false);
  // The runtime's request_connection hint fires on /connected account|not connected/i.
  expect(out.error).toMatch(/not connected/i);
});

test("a foreign payload maps to an honest failure, never a crash", () => {
  expect(
    hubPayload({ content: [{ type: "text", text: "not json" }] }),
  ).toBeNull();
  expect(executeOutcome(null, "X")).toEqual({
    successful: false,
    error: "the app hub returned no result",
  });
});

test("toolkit attribution prefers the longest known multi-word toolkit", () => {
  expect(
    toolkitOfSlug("MICROSOFT_TEAMS_SEND_MESSAGE", ["microsoft_teams", "gmail"]),
  ).toBe("microsoft_teams");
  expect(toolkitOfSlug("GMAIL_SEND_EMAIL", ["microsoft_teams"])).toBe("gmail");
});
