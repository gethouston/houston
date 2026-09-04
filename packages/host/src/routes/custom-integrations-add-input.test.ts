import { expect, test } from "vitest";
import { parseAddInput } from "./custom-integrations";

const mcp = { kind: "mcp", name: "HighLevel", endpoint: "https://x.test/mcp/" };

test("an MCP add carries its OAuth scope exclusions, deduped and trimmed", () => {
  const parsed = parseAddInput({
    ...mcp,
    auth: "oauth",
    oauthScopeExclusions: [
      " files.readonly",
      "files.readonly",
      "emails/stats.readonly",
    ],
  });
  expect(parsed).toMatchObject({
    kind: "mcp",
    oauthScopeExclusions: ["files.readonly", "emails/stats.readonly"],
  });
  // Absent or empty leaves the field out entirely.
  expect(parseAddInput({ ...mcp, auth: "oauth" })).not.toHaveProperty(
    "oauthScopeExclusions",
  );
  expect(
    parseAddInput({ ...mcp, auth: "oauth", oauthScopeExclusions: [] }),
  ).not.toHaveProperty("oauthScopeExclusions");
});

test("malformed scope exclusions are refused with a named reason", () => {
  expect(
    parseAddInput({ ...mcp, auth: "oauth", oauthScopeExclusions: "x" }),
  ).toBe("'oauthScopeExclusions' must be a list");
  expect(
    parseAddInput({ ...mcp, auth: "oauth", oauthScopeExclusions: [1] }),
  ).toBe("'oauthScopeExclusions' entries must be short scope names");
  expect(
    parseAddInput({ ...mcp, auth: "oauth", oauthScopeExclusions: [""] }),
  ).toBe("'oauthScopeExclusions' entries must be short scope names");
  expect(
    parseAddInput({
      ...mcp,
      auth: "oauth",
      oauthScopeExclusions: Array.from({ length: 65 }, (_, i) => `s${i}`),
    }),
  ).toBe("'oauthScopeExclusions' lists too many scopes");
});
