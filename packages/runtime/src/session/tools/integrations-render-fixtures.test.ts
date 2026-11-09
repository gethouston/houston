import { readdirSync, readFileSync } from "node:fs";
import { searchComposio } from "@houston/host/src/integrations/composio-search";
import { describe, expect, it } from "vitest";
import {
  renderSearchItems,
  schemaSignature,
  type ToolMatch,
} from "./integrations-render";
import { schemaObject } from "./integrations-schema-node";
import { searchResultText } from "./integrations-search-result";

const dir = new URL("./fixtures/composio/", import.meta.url);
const fixtures: ToolMatch[] = readdirSync(dir).map((file) => ({
  action: file.replace(".json", ""),
  toolkit: file.split("_")[0]?.toLowerCase() ?? "",
  description: "Public Composio action",
  inputParams: JSON.parse(readFileSync(new URL(file, dir), "utf8")),
}));
const sheets = fixtures.find(
  (m) => m.action === "GOOGLESHEETS_SET_DATA_VALIDATION_RULE",
);
const hubspot = fixtures.find((m) => m.toolkit === "hubspot");
if (!sheets || !hubspot) throw new Error("missing fixtures");

describe("real Composio parameter schemas", () => {
  it.each(
    fixtures,
  )("recovers every parameter of $action through exact lookup", async (match) => {
    const tail = renderSearchItems([sheets, sheets, match])
      .split(`- ${match.action}`)
      .at(-1);
    expect(tail).toContain("params: ");
    expect(tail).not.toContain("\n    ");
    const calls: Record<string, string>[] = [];
    const { items } = await searchComposio(
      {
        listConnections: async () => [],
        catalog: async () => [{ slug: match.toolkit, name: match.toolkit }],
        queryTools: async (query) => {
          calls.push(query);
          return query.tool_slugs === match.action ? [match] : [];
        },
      },
      match.action,
      match.toolkit,
    );
    expect(calls).toContainEqual({
      tool_slugs: match.action,
      toolkit_slug: match.toolkit,
    });
    const detailed = renderSearchItems(items);
    const json = JSON.stringify(match.inputParams);
    if (json.length <= 2000) {
      expect(detailed).toContain(`params: ${json}`);
    } else {
      const properties =
        schemaObject(schemaObject(match.inputParams)?.properties) ?? {};
      for (const [name, spec] of Object.entries(properties)) {
        const description = schemaObject(spec)?.description;
        const line = detailed
          .split("\n")
          .find(
            (line) =>
              line.startsWith(`    ${name}:`) ||
              line.startsWith(`    ${name}?:`),
          );
        expect(line).toBeDefined();
        if (typeof description === "string")
          expect(line).toContain(description.slice(0, 30));
      }
    }
    expect(
      detailed.slice(detailed.indexOf(`- ${match.action}`)).length,
    ).toBeLessThanOrEqual(3300);
    if (match.action === sheets.action) {
      expect(tail).not.toContain('"TEXT_IS_EMAIL"');
      expect(
        detailed
          .split("\n")
          .find((line) => line.startsWith("    validation_type?:")),
      ).toContain('"TEXT_IS_EMAIL"');
      const values = schemaObject(
        schemaObject(match.inputParams)?.properties,
      )?.validation_type;
      const literals = schemaObject(values)?.enum;
      if (!Array.isArray(literals)) throw new Error("missing validation enum");
      for (const value of literals)
        expect(detailed).toContain(JSON.stringify(value));
    }
  });

  it("preserves Sheets mode in both tiers", () => {
    expect(renderSearchItems([sheets])).toContain('mode: "SET"|"CLEAR"');
    expect(
      renderSearchItems([sheets, sheets, sheets])
        .split(`- ${sheets.action}`)
        .at(-1),
    ).toContain('mode: "SET"|"CLEAR"');
  });

  it("preserves HubSpot sort objects and nested filters", () => {
    const signature = schemaSignature(hubspot.inputParams);
    expect(signature).toContain(
      'sorts?: { direction: "ASCENDING"|"DESCENDING", propertyName: string }[]',
    );
    expect(signature).toContain("filterGroups?: { filters: { operator:");
    expect(signature).toContain(
      "propertyName: string, value?: string, values?: string[]",
    );
  });

  it("lists Gmail recipients as required and uses Slack markdown_text", () => {
    const gmail = fixtures.find((m) => m.action === "GMAIL_FORWARD_MESSAGE");
    const slack = fixtures.find((m) => m.action === "SLACK_SEND_MESSAGE");
    expect(schemaSignature(gmail?.inputParams)).toContain(
      "recipients: string[]",
    );
    const signature = schemaSignature(slack?.inputParams);
    expect(signature).toContain("markdown_text?: string");
    expect(signature).not.toMatch(/[{,] text[?:]/);
  });

  it("keeps thirty real rows below 24 KB and two detailed rows in the first 8K", () => {
    const rows = Array.from(
      { length: 30 },
      (_, i) => fixtures[i % fixtures.length] ?? sheets,
    );
    const text = searchResultText(rows, "");
    expect(Buffer.byteLength(text)).toBeLessThan(24 * 1024);
    for (const first of fixtures)
      for (const second of fixtures) {
        const third = { ...hubspot, action: "THIRD_ACTION" };
        const result = searchResultText([first, second, third], "");
        expect(result.indexOf("- THIRD_ACTION")).toBeLessThan(8000);
      }
    const worst = searchResultText([sheets, sheets, hubspot], "");
    expect(worst).toContain("integration_search");
    expect(worst).toContain("`app`");
    expect(worst).toContain("exact action name as `query`");
    expect(worst).toContain(
      "the results then include that action with its parameters described",
    );
  });
});

it("renders unions, nullable fields, defaults, and deprecated fields", () => {
  const text = renderSearchItems([
    sheets,
    sheets,
    {
      action: "EXAMPLE",
      toolkit: "example",
      description: "Example",
      inputParams: {
        properties: {
          values: {
            anyOf: [
              { type: "array", items: { type: "string" } },
              { type: "null" },
            ],
            default: [],
          },
          choice: { oneOf: [{ type: "string" }, { type: "integer" }] },
          old: { type: "string", deprecated: true },
          legacy: { type: "string", description: "DEPRECATED: use choice" },
          unknown: {},
        },
      },
    },
  ]);
  expect(text).toContain("values?: string[]");
  expect(text).toContain("choice?: string|integer");
  expect(text).toContain("unknown?: any");
  expect(text).toContain("old? [deprecated]");
  expect(text).toContain("legacy? [deprecated]");
  expect(
    renderSearchItems([
      {
        action: "DEFAULT",
        toolkit: "example",
        description: "Default",
        inputParams: {
          properties: {
            values: {
              type: "array",
              default: [],
              description: "x".repeat(2001),
            },
          },
        },
      },
    ]),
  ).toContain("default: []");
  expect(text).not.toContain("|null");
});

it("groups array item alternatives without changing nested object unions", () => {
  expect(
    schemaSignature({
      properties: {
        values: {
          type: "array",
          items: {
            oneOf: [
              { type: "object", properties: { id: { type: "string" } } },
              { type: "string" },
            ],
          },
        },
      },
    }),
  ).toContain("values?: ({ id?: string }|string)[]");
});

it("bounds enum literals, depth, and signature length with clear cuts", () => {
  const enumSignature = schemaSignature({
    properties: { mode: { enum: Array.from({ length: 15 }, (_, i) => i) } },
  });
  expect(enumSignature).toContain("10|11|…");
  expect(enumSignature).not.toContain("|12");
  const nested = { type: "object", properties: { leaf: { type: "string" } } };
  const deep = {
    properties: { a: { properties: { b: { properties: { c: nested } } } } },
  };
  expect(schemaSignature(deep)).toContain("leaf?: string");
  const huge = {
    properties: Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [`field${i}`, { type: "string" }]),
    ),
  };
  const signature = schemaSignature(huge);
  expect(signature?.length).toBeLessThanOrEqual(700);
  expect(signature).toMatch(/… \[signature cut\]$/);
});

it("clips descriptions to keep all parameter details within the row budget", () => {
  const text = renderSearchItems([
    {
      action: "WIDE",
      toolkit: "example",
      description: "Wide",
      inputParams: {
        properties: Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [
            `p${i}`,
            { type: "string", description: "x".repeat(200) },
          ]),
        ),
      },
    },
  ]);
  expect(text).toContain("params: { p0?: string");
  expect(text).toContain("\n    p0?: string;");
  expect(text).toContain("\n    p24?: string;");
  expect(text).toContain("exact action name as `query`");
});
