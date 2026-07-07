import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildMcpAuth,
  editMcpForm,
  emptyMcpForm,
  type McpFormValues,
  validateCreate,
  validateEdit,
} from "../src/components/integrations/mcp-server-model.ts";

function form(extra: Partial<McpFormValues> = {}): McpFormValues {
  return {
    name: "Acme Tracker",
    url: "https://mcp.acme.com",
    description: "Acme's issue tracker.",
    authMode: "bearer",
    headerName: "",
    authValue: "secret-token",
    ...extra,
  };
}

describe("buildMcpAuth", () => {
  it("builds a bearer auth", () => {
    deepStrictEqual(buildMcpAuth("bearer", ""), { type: "bearer" });
  });
  it("builds a header auth and trims the header", () => {
    deepStrictEqual(buildMcpAuth("header", " X-Api-Key "), {
      type: "header",
      header: "X-Api-Key",
    });
  });
  it("builds a none auth", () => {
    deepStrictEqual(buildMcpAuth("none", ""), { type: "none" });
  });
});

describe("validateCreate", () => {
  it("returns config + authValue for a bearer server", () => {
    const r = validateCreate(form());
    strictEqual(r.ok, true);
    if (!r.ok) return;
    deepStrictEqual(r.config, {
      name: "Acme Tracker",
      url: "https://mcp.acme.com",
      auth: { type: "bearer" },
      description: "Acme's issue tracker.",
    });
    strictEqual(r.authValue, "secret-token");
  });

  it("omits authValue for a none server", () => {
    const r = validateCreate(
      form({ authMode: "none", authValue: "", description: "" }),
    );
    strictEqual(r.ok, true);
    if (!r.ok) return;
    deepStrictEqual(r.config, {
      name: "Acme Tracker",
      url: "https://mcp.acme.com",
      auth: { type: "none" },
    });
    strictEqual("authValue" in r, false);
  });

  it("validates a custom-header server", () => {
    const r = validateCreate(
      form({ authMode: "header", headerName: "X-Api-Key" }),
    );
    strictEqual(r.ok, true);
    if (r.ok)
      deepStrictEqual(r.config.auth, { type: "header", header: "X-Api-Key" });
  });

  it("flags an empty name", () => {
    deepStrictEqual(validateCreate(form({ name: "  " })), {
      ok: false,
      field: "name",
    });
  });

  it("flags a name over 64 chars", () => {
    deepStrictEqual(validateCreate(form({ name: "a".repeat(65) })), {
      ok: false,
      field: "name",
    });
  });

  it("flags a non-https URL", () => {
    deepStrictEqual(validateCreate(form({ url: "http://mcp.acme.com" })), {
      ok: false,
      field: "url",
    });
  });

  it("flags a URL with embedded credentials", () => {
    deepStrictEqual(validateCreate(form({ url: "https://u:p@mcp.acme.com" })), {
      ok: false,
      field: "url",
    });
  });

  it("flags an over-long description", () => {
    deepStrictEqual(validateCreate(form({ description: "d".repeat(501) })), {
      ok: false,
      field: "description",
    });
  });

  it("flags an invalid header name", () => {
    deepStrictEqual(
      validateCreate(form({ authMode: "header", headerName: "bad header!" })),
      { ok: false, field: "authHeader" },
    );
  });

  it("requires the secret for bearer", () => {
    deepStrictEqual(validateCreate(form({ authValue: "" })), {
      ok: false,
      field: "authValue",
    });
  });

  it("rejects an over-long secret", () => {
    deepStrictEqual(validateCreate(form({ authValue: "k".repeat(4097) })), {
      ok: false,
      field: "authValue",
    });
  });

  it("rejects the keep mode on create", () => {
    deepStrictEqual(validateCreate(form({ authMode: "keep" })), {
      ok: false,
      field: "authValue",
    });
  });
});

describe("validateEdit", () => {
  it("sends only name + description when auth is kept and url is blank", () => {
    const r = validateEdit(
      editMcpForm({ name: "Acme Tracker", description: "Acme's tracker." }),
    );
    strictEqual(r.ok, true);
    if (r.ok)
      deepStrictEqual(r.patch, {
        name: "Acme Tracker",
        description: "Acme's tracker.",
      });
  });

  it("includes url + auth + authValue when the user fills them", () => {
    const base = editMcpForm({ name: "Acme", description: "d" });
    const r = validateEdit({
      ...base,
      url: "https://mcp.new.com",
      authMode: "header",
      headerName: "X-Api-Key",
      authValue: "rotated",
    });
    strictEqual(r.ok, true);
    if (r.ok)
      deepStrictEqual(r.patch, {
        name: "Acme",
        description: "d",
        url: "https://mcp.new.com",
        auth: { type: "header", header: "X-Api-Key" },
        authValue: "rotated",
      });
  });

  it("keeps the stored secret when a real auth mode has a blank secret", () => {
    const base = editMcpForm({ name: "Acme", description: "d" });
    const r = validateEdit({ ...base, authMode: "bearer" });
    strictEqual(r.ok, true);
    if (r.ok) {
      deepStrictEqual(r.patch.auth, { type: "bearer" });
      strictEqual("authValue" in r.patch, false);
    }
  });

  it("clears auth (no secret) when none is chosen", () => {
    const base = editMcpForm({ name: "Acme", description: "d" });
    const r = validateEdit({ ...base, authMode: "none", authValue: "ignored" });
    strictEqual(r.ok, true);
    if (r.ok) {
      deepStrictEqual(r.patch.auth, { type: "none" });
      strictEqual("authValue" in r.patch, false);
    }
  });

  it("flags a filled but invalid url", () => {
    const base = editMcpForm({ name: "Acme", description: "d" });
    deepStrictEqual(validateEdit({ ...base, url: "http://insecure.com" }), {
      ok: false,
      field: "url",
    });
  });

  it("flags an emptied name", () => {
    deepStrictEqual(validateEdit(editMcpForm({ name: "", description: "d" })), {
      ok: false,
      field: "name",
    });
  });
});

describe("form factories", () => {
  it("emptyMcpForm defaults to no auth", () => {
    const v = emptyMcpForm();
    strictEqual(v.authMode, "none");
    strictEqual(v.url, "");
    strictEqual(v.authValue, "");
  });

  it("editMcpForm prefills name + description, keeps auth, blanks url + secret", () => {
    const v = editMcpForm({ name: "N", description: "D" });
    strictEqual(v.name, "N");
    strictEqual(v.description, "D");
    strictEqual(v.url, "");
    strictEqual(v.authMode, "keep");
    strictEqual(v.authValue, "");
  });
});
