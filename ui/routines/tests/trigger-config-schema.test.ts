import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  coerceConfigValue,
  defaultTriggerConfig,
  humanizeKey,
  missingRequired,
  parseTriggerConfigSchema,
  type TriggerConfigField,
} from "../src/trigger-config-schema.ts";

describe("humanizeKey", () => {
  it("splits snake_case and camelCase", () => {
    assert.equal(humanizeKey("owner_login"), "Owner login");
    assert.equal(humanizeKey("ownerLogin"), "Owner login");
    assert.equal(humanizeKey("repo"), "Repo");
  });
  it("falls back to the raw key when nothing to split", () => {
    assert.equal(humanizeKey("___"), "___");
  });
});

describe("parseTriggerConfigSchema", () => {
  it("maps strings, numbers, integers and booleans", () => {
    const parsed = parseTriggerConfigSchema({
      type: "object",
      required: ["owner"],
      properties: {
        owner: { type: "string", title: "Owner", description: "GitHub owner" },
        count: { type: "integer" },
        rate: { type: "number" },
        include_forks: { type: "boolean", default: true },
      },
    });
    assert.equal(parsed.supported, true);
    if (!parsed.supported) return;
    const byKey = Object.fromEntries(parsed.fields.map((f) => [f.key, f]));
    assert.equal(byKey.owner.kind, "string");
    assert.equal(byKey.owner.label, "Owner");
    assert.equal(byKey.owner.description, "GitHub owner");
    assert.equal(byKey.owner.required, true);
    assert.equal(byKey.count.kind, "number");
    assert.equal(byKey.count.required, false);
    assert.equal(byKey.rate.kind, "number");
    assert.equal(byKey.include_forks.kind, "boolean");
    assert.equal(byKey.include_forks.defaultValue, true);
  });

  it("labels a title-less field from its humanized key", () => {
    const parsed = parseTriggerConfigSchema({
      properties: { repo_name: { type: "string" } },
    });
    assert.equal(parsed.supported, true);
    if (!parsed.supported) return;
    assert.equal(parsed.fields[0].label, "Repo name");
  });

  it("treats enum as a select regardless of declared type", () => {
    const parsed = parseTriggerConfigSchema({
      properties: {
        label: { type: "string", enum: ["urgent", "later"] },
      },
    });
    assert.equal(parsed.supported, true);
    if (!parsed.supported) return;
    const field = parsed.fields[0];
    assert.equal(field.kind, "enum");
    assert.deepEqual(field.options, [
      { value: "urgent", label: "Urgent" },
      { value: "later", label: "Later" },
    ]);
  });

  it("returns supported with no fields for an empty object schema", () => {
    const parsed = parseTriggerConfigSchema({ type: "object" });
    assert.equal(parsed.supported, true);
    if (!parsed.supported) return;
    assert.deepEqual(parsed.fields, []);
  });

  it("degrades to unsupported for nested objects", () => {
    const parsed = parseTriggerConfigSchema({
      properties: { filter: { type: "object" } },
    });
    assert.equal(parsed.supported, false);
  });

  it("degrades to unsupported for arrays", () => {
    const parsed = parseTriggerConfigSchema({
      properties: { tags: { type: "array" } },
    });
    assert.equal(parsed.supported, false);
  });

  it("degrades to unsupported for non-object schemas", () => {
    assert.equal(parseTriggerConfigSchema("nope").supported, false);
    assert.equal(parseTriggerConfigSchema(null).supported, false);
    assert.equal(parseTriggerConfigSchema(42).supported, false);
  });
});

describe("defaultTriggerConfig", () => {
  it("seeds schema defaults and false booleans, skips optional strings", () => {
    const fields: TriggerConfigField[] = [
      { key: "owner", kind: "string", label: "Owner", required: true },
      {
        key: "notify",
        kind: "boolean",
        label: "Notify",
        required: false,
        defaultValue: true,
      },
      { key: "silent", kind: "boolean", label: "Silent", required: false },
    ];
    assert.deepEqual(defaultTriggerConfig(fields), {
      notify: true,
      silent: false,
    });
  });
});

describe("coerceConfigValue", () => {
  it("parses numeric strings for number fields", () => {
    assert.equal(coerceConfigValue("number", "12"), 12);
    assert.equal(coerceConfigValue("number", "3.5"), 3.5);
  });
  it("keeps an unparseable number string as-is", () => {
    assert.equal(coerceConfigValue("number", "abc"), "abc");
    assert.equal(coerceConfigValue("number", ""), "");
  });
  it("passes strings/booleans through untouched", () => {
    assert.equal(coerceConfigValue("string", "hi"), "hi");
    assert.equal(coerceConfigValue("boolean", true), true);
  });
});

describe("missingRequired", () => {
  const fields: TriggerConfigField[] = [
    { key: "owner", kind: "string", label: "Owner", required: true },
    { key: "repo", kind: "string", label: "Repo", required: false },
    { key: "count", kind: "number", label: "Count", required: true },
  ];
  it("flags empty required strings and numbers", () => {
    assert.deepEqual(missingRequired(fields, {}), ["owner", "count"]);
    assert.deepEqual(missingRequired(fields, { owner: "  ", count: "x" }), [
      "owner",
      "count",
    ]);
  });
  it("passes when required fields are filled", () => {
    assert.deepEqual(
      missingRequired(fields, { owner: "acme", count: "5" }),
      [],
    );
  });
});
