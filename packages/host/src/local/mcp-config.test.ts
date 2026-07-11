import { expect, test } from "vitest";
import { parseMcpIntegrations } from "./mcp-config";

const redirectUrl = "http://127.0.0.1:4318/v1/integrations/mcp/callback";

test("parses a bare URL and derives its provider id", () => {
  expect(parseMcpIntegrations("https://rube.app/mcp", redirectUrl)).toEqual([
    {
      id: "rube",
      url: "https://rube.app/mcp",
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
      '[{"id":"rube","url":"https://rube.app/mcp","name":"Rube"}]',
      redirectUrl,
    ),
  ).toEqual([
    {
      id: "rube",
      url: "https://rube.app/mcp",
      name: "Rube",
      redirectUrl,
    },
  ]);
});

test("rejects malformed JSON configuration", () => {
  expect(() => parseMcpIntegrations("[{", redirectUrl)).toThrow();
});
