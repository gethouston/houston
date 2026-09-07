import { expect, test } from "vitest";
import { parseAddInput } from "./custom-integrations";

const mcp = (extra: Record<string, unknown>) => ({
  kind: "mcp",
  name: "HighLevel",
  endpoint: "https://services.leadconnectorhq.com/mcp/",
  auth: "credential",
  ...extra,
});

test("static headers ride the MCP add input, trimmed, bounded, never a credential", () => {
  const ok = parseAddInput(mcp({ headers: { locationId: " loc_1 " } }));
  expect(ok).toMatchObject({ kind: "mcp", headers: { locationId: "loc_1" } });
  expect(parseAddInput(mcp({}))).not.toHaveProperty("headers");
  expect(parseAddInput(mcp({ headers: [] }))).toMatch(/must be an object/);
  expect(parseAddInput(mcp({ headers: { "bad name": "x" } }))).toMatch(
    /invalid header name/,
  );
  expect(
    parseAddInput(mcp({ headers: { Authorization: "Bearer x" } })),
  ).toMatch(/save secrets as the credential/);
  expect(parseAddInput(mcp({ headers: { locationId: "" } }))).toMatch(
    /short non-empty string/,
  );
  expect(parseAddInput(mcp({ headers: { locationId: 7 } }))).toMatch(
    /short non-empty string/,
  );
});
