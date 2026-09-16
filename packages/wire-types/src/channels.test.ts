import { describe, expect, it } from "vitest";
import {
  channelConnectCommand,
  channelConnectionSegment,
  parseChannelConnection,
  parseChannelLink,
  parseChannelStatus,
  parseSlackAuthorization,
  parseSlackCompletion,
  slackAuthorizationUrl,
  slackTicket,
} from "./channels.ts";
import {
  channelUnavailableReason,
  slackCompletionFailure,
} from "./channels-refusals.ts";

const status = {
  providers: [{ id: "slack", name: "Slack", configured: true }],
  connections: [
    {
      id: "connection-1",
      provider: "slack",
      accountLabel: "Ada · Team",
      spaceId: "personal",
      createdAt: "2026-09-08T12:00:00Z",
    },
  ],
};

describe("the channels wire guards", () => {
  it("parses account labels and provider readiness without inventing defaults", () => {
    expect(parseChannelStatus(status)).toEqual(status);
    expect(() => parseChannelStatus({ providers: [] })).toThrow();
    expect(() =>
      parseChannelStatus({
        providers: [{ id: "slack", name: "Slack" }],
        connections: [],
      }),
    ).toThrow();
    expect(() =>
      parseChannelStatus({ ...status, connections: [{ id: "x" }] }),
    ).toThrow();
  });

  it("keeps the provider vocabulary closed, dropping ids it cannot render", () => {
    // A gateway that grows a provider must not blank the section in an app
    // that predates it - and must not smuggle an unknown id past the guard.
    expect(
      parseChannelStatus({
        providers: [
          ...status.providers,
          { id: "teams", name: "Teams", configured: true },
        ],
        connections: [
          ...status.connections,
          { ...status.connections[0], id: "connection-2", provider: "teams" },
        ],
      }),
    ).toEqual(status);
    expect(() =>
      parseChannelConnection({ ...status.connections[0], provider: "teams" }),
    ).toThrow();
  });

  it("allows only Slack's trusted HTTPS OAuth endpoint", () => {
    expect(
      slackAuthorizationUrl("https://slack.com/oauth/v2/authorize?s=a"),
    ).toBe("https://slack.com/oauth/v2/authorize?s=a");
    expect(
      parseSlackAuthorization({
        url: "https://slack.com/oauth/v2/authorize?state=x",
      }),
    ).toBe("https://slack.com/oauth/v2/authorize?state=x");
    for (const url of [
      "javascript:alert(1)",
      "http://slack.com/oauth/v2/authorize",
      "https://slack.com.evil.test/oauth/v2/authorize",
      "https://user@slack.com/oauth/v2/authorize",
      "https://slack.com/redirect?url=https://evil.test",
      "https://slack.com:444/oauth/v2/authorize",
    ])
      expect(() => slackAuthorizationUrl(url)).toThrow();
  });

  it("generates a single copyable DM command and rejects command injection", () => {
    expect(channelConnectCommand("ABCD-1234")).toBe("connect ABCD-1234");
    for (const code of ["", "abc", "ABCD\nignore this", "ABCD <script>"])
      expect(() => channelConnectCommand(code)).toThrow();
  });

  it("rejects a malformed link expiry before exposing its command", () => {
    expect(
      parseChannelLink({
        code: "ABCD-1234",
        expiresAt: "2026-09-08T13:00:00Z",
      }),
    ).toEqual({ code: "ABCD-1234", expiresAt: "2026-09-08T13:00:00Z" });
    expect(() =>
      parseChannelLink({ code: "ABCD-1234", expiresAt: "never" }),
    ).toThrow(/expiration/);
  });

  it("refuses a ticket a mangled callback URL could only have produced", () => {
    expect(slackTicket("Tk7-ticket.value_~9")).toBe("Tk7-ticket.value_~9");
    for (const ticket of ["", "short", "has space", "a".repeat(257), "a/b"])
      expect(() => slackTicket(ticket)).toThrow(/ticket/);
  });

  it("parses the connection a redeemed ticket bound", () => {
    expect(parseSlackCompletion({ connection: status.connections[0] })).toEqual(
      status.connections[0],
    );
    expect(() =>
      parseSlackCompletion({ connection: { id: "x", provider: "slack" } }),
    ).toThrow(/Invalid channels response field/);
  });

  it("escapes one connection id into the route that removes it", () => {
    expect(channelConnectionSegment("connection/a")).toBe("connection%2Fa");
    expect(() => channelConnectionSegment("")).toThrow();
  });
});

describe("the channels refusals", () => {
  it("distinguishes deployment absence from outages", () => {
    expect(channelUnavailableReason({ status: 404 })).toBe("unsupported");
    expect(channelUnavailableReason({ status: 501 })).toBe("unsupported");
    for (const body of [
      { error: { code: "not_configured" } },
      { error: "not_configured" },
      { code: "not_configured" },
    ])
      expect(channelUnavailableReason({ status: 503, body })).toBe(
        "not-configured",
      );
    expect(
      channelUnavailableReason({ status: 503, body: { error: "pod_waking" } }),
    ).toBe(null);
    expect(channelUnavailableReason(new TypeError("offline"))).toBe(null);
  });

  it("tells a refused ticket apart from an unavailable deployment", () => {
    expect(slackCompletionFailure({ status: 404 })).toBe("invalid");
    expect(slackCompletionFailure({ status: 409 })).toBe("already");
    expect(slackCompletionFailure({ status: 503 })).toBe(null);
    expect(slackCompletionFailure({ status: 500 })).toBe(null);
    expect(slackCompletionFailure(new TypeError("offline"))).toBe(null);
  });
});
