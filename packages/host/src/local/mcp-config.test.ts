import { expect, test } from "vitest";
import { parseMcpIntegrations } from "./mcp-config";

const redirectUrl = "http://127.0.0.1:4318/v1/integrations/mcp/callback";

test("parses a bare URL and derives its provider id", () => {
  expect(
    parseMcpIntegrations("https://connect.composio.dev/mcp", redirectUrl),
  ).toEqual([
    {
      id: "composio-apps",
      url: "https://connect.composio.dev/mcp",
      redirectUrl,
    },
  ]);
  expect(
    parseMcpIntegrations("https://tools.example.com/mcp", redirectUrl)[0]?.id,
  ).toBe("tools");
});

test("parses the JSON server list", () => {
  expect(
    parseMcpIntegrations(
      '[{"id":"composio-apps","url":"https://connect.composio.dev/mcp","name":"Composio"}]',
      redirectUrl,
    ),
  ).toEqual([
    {
      id: "composio-apps",
      url: "https://connect.composio.dev/mcp",
      name: "Composio",
      redirectUrl,
    },
  ]);
});

test("rejects malformed JSON configuration", () => {
  expect(() => parseMcpIntegrations("[{", redirectUrl)).toThrow();
});
