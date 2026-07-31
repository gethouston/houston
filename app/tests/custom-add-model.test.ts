import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  addInputFrom,
  applyDetect,
  type CustomAddForm,
  detectSummaryKey,
  EMPTY_CUSTOM_ADD_FORM,
  isServiceUrl,
} from "../src/components/integrations/custom-add-model.ts";

const form = (over: Partial<CustomAddForm> = {}): CustomAddForm => ({
  ...EMPTY_CUSTOM_ADD_FORM,
  ...over,
});

describe("isServiceUrl", () => {
  it("accepts http(s) URLs only", () => {
    strictEqual(isServiceUrl("https://api.acme.com/openapi.json"), true);
    strictEqual(isServiceUrl("http://localhost:8080/spec"), true);
    strictEqual(isServiceUrl("  https://mcp.acme.com  "), true);
    strictEqual(isServiceUrl("acme.com"), false);
    strictEqual(isServiceUrl("ftp://acme.com"), false);
    strictEqual(isServiceUrl(""), false);
    strictEqual(isServiceUrl("https:// spaced.com"), false);
  });
});

describe("applyDetect", () => {
  it("adopts the detected kind and fills an empty name", () => {
    const next = applyDetect(form({ url: "https://x" }), {
      kind: "mcp",
      name: "Acme MCP",
    });
    strictEqual(next.kind, "mcp");
    strictEqual(next.name, "Acme MCP");
  });

  it("never overwrites a name the user already typed", () => {
    const next = applyDetect(form({ name: "My service" }), {
      kind: "openapi",
      name: "Acme API",
    });
    strictEqual(next.name, "My service");
  });

  it("flips needsKey on when the probe hit an auth wall, never off", () => {
    const on = applyDetect(form(), {
      kind: "mcp",
      requiresAuthentication: true,
    });
    strictEqual(on.needsKey, true);
    const kept = applyDetect(form({ needsKey: true }), { kind: "mcp" });
    strictEqual(kept.needsKey, true);
  });

  it("an unknown result changes nothing", () => {
    const before = form({ kind: "mcp", name: "Keep", needsKey: true });
    deepStrictEqual(applyDetect(before, { kind: "unknown" }), before);
  });

  it("an OAuth wall never flips needsKey on — a pasted key cannot satisfy it", () => {
    const next = applyDetect(form(), {
      kind: "mcp",
      requiresAuthentication: true,
      requiresOAuth: true,
    });
    strictEqual(next.needsKey, false);
    // ...but a needsKey the user already turned on is left alone.
    const kept = applyDetect(form({ needsKey: true }), {
      kind: "mcp",
      requiresAuthentication: true,
      requiresOAuth: true,
    });
    strictEqual(kept.needsKey, true);
  });
});

describe("detectSummaryKey", () => {
  it("maps each verdict to its copy key", () => {
    strictEqual(
      detectSummaryKey({ kind: "openapi" }),
      "custom.add.detected.api",
    );
    strictEqual(detectSummaryKey({ kind: "mcp" }), "custom.add.detected.mcp");
    strictEqual(
      detectSummaryKey({ kind: "mcp", requiresOAuth: true }),
      "custom.add.detected.mcpOauth",
    );
    strictEqual(
      detectSummaryKey({ kind: "unknown" }),
      "custom.add.detected.unknown",
    );
  });
});

describe("addInputFrom", () => {
  it("is null while a required field is missing or invalid", () => {
    strictEqual(addInputFrom(form()), null);
    strictEqual(addInputFrom(form({ name: "Acme" })), null);
    strictEqual(addInputFrom(form({ url: "https://x" })), null);
    strictEqual(addInputFrom(form({ name: "Acme", url: "not-a-url" })), null);
  });

  it("builds the openapi input with trimmed fields", () => {
    deepStrictEqual(
      addInputFrom(
        form({ name: "  Acme  ", url: " https://acme.com/openapi.json " }),
      ),
      {
        kind: "openapi",
        name: "Acme",
        url: "https://acme.com/openapi.json",
        auth: "none",
      },
    );
  });

  it("builds the mcp input with the url as endpoint and credential auth", () => {
    deepStrictEqual(
      addInputFrom(
        form({
          kind: "mcp",
          name: "Acme MCP",
          url: "https://mcp.acme.com",
          needsKey: true,
        }),
      ),
      {
        kind: "mcp",
        name: "Acme MCP",
        endpoint: "https://mcp.acme.com",
        auth: "credential",
      },
    );
  });
});
