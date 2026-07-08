import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  baseUrlError,
  buildAuth,
  type CustomFormValues,
  editCustomForm,
  emptyCustomForm,
  presetPrefix,
  validateCreate,
  validateEdit,
} from "../src/components/integrations/custom-integration-model.ts";

function form(extra: Partial<CustomFormValues> = {}): CustomFormValues {
  return {
    name: "Acme CRM",
    baseUrl: "https://api.acme.com",
    description: "The Acme CRM API.",
    authType: "header",
    headerName: "Authorization",
    prefixPreset: "bearer",
    customPrefix: "",
    queryParam: "",
    apiKey: "secret-key",
    ...extra,
  };
}

describe("presetPrefix", () => {
  it("maps presets to literal prefixes", () => {
    strictEqual(presetPrefix("bearer", "ignored"), "Bearer ");
    strictEqual(presetPrefix("none", "ignored"), "");
    strictEqual(presetPrefix("custom", "Token "), "Token ");
  });
});

describe("buildAuth", () => {
  it("builds a bearer header auth", () => {
    deepStrictEqual(buildAuth(form()), {
      type: "header",
      header: "Authorization",
      prefix: "Bearer ",
    });
  });

  it("omits the prefix for the none preset", () => {
    deepStrictEqual(
      buildAuth(form({ prefixPreset: "none", headerName: "X-Api-Key" })),
      {
        type: "header",
        header: "X-Api-Key",
      },
    );
  });

  it("uses the verbatim custom prefix", () => {
    deepStrictEqual(
      buildAuth(form({ prefixPreset: "custom", customPrefix: "Token " })),
      { type: "header", header: "Authorization", prefix: "Token " },
    );
  });

  it("builds a query auth and trims the param", () => {
    deepStrictEqual(
      buildAuth(form({ authType: "query", queryParam: " api_key " })),
      { type: "query", param: "api_key" },
    );
  });
});

describe("baseUrlError", () => {
  it("accepts a plain https URL", () => {
    strictEqual(baseUrlError("https://api.acme.com/v1"), null);
  });
  it("rejects a non-URL", () => {
    strictEqual(baseUrlError("not a url"), "invalid");
  });
  it("rejects http", () => {
    strictEqual(baseUrlError("http://api.acme.com"), "not_https");
  });
  it("rejects embedded credentials", () => {
    strictEqual(
      baseUrlError("https://user:pass@api.acme.com"),
      "has_credentials",
    );
  });
});

describe("validateCreate", () => {
  it("returns the config + apiKey on a valid header form", () => {
    const r = validateCreate(form());
    strictEqual(r.ok, true);
    if (!r.ok) return;
    deepStrictEqual(r.config, {
      name: "Acme CRM",
      baseUrl: "https://api.acme.com",
      auth: { type: "header", header: "Authorization", prefix: "Bearer " },
      description: "The Acme CRM API.",
    });
    strictEqual(r.apiKey, "secret-key");
  });

  it("validates a query-param form", () => {
    const r = validateCreate(
      form({ authType: "query", queryParam: "api_key", headerName: "" }),
    );
    strictEqual(r.ok, true);
    if (r.ok)
      deepStrictEqual(r.config.auth, { type: "query", param: "api_key" });
  });

  it("flags an empty name", () => {
    const r = validateCreate(form({ name: "  " }));
    deepStrictEqual(r, { ok: false, field: "name" });
  });

  it("flags a name over 64 chars", () => {
    const r = validateCreate(form({ name: "a".repeat(65) }));
    deepStrictEqual(r, { ok: false, field: "name" });
  });

  it("flags a non-https base URL", () => {
    const r = validateCreate(form({ baseUrl: "http://api.acme.com" }));
    deepStrictEqual(r, { ok: false, field: "baseUrl" });
  });

  it("flags an empty description", () => {
    const r = validateCreate(form({ description: "" }));
    deepStrictEqual(r, { ok: false, field: "description" });
  });

  it("flags an invalid header name", () => {
    const r = validateCreate(form({ headerName: "bad header!" }));
    deepStrictEqual(r, { ok: false, field: "authField" });
  });

  it("flags an invalid query param", () => {
    const r = validateCreate(
      form({ authType: "query", queryParam: "bad param!" }),
    );
    deepStrictEqual(r, { ok: false, field: "authField" });
  });

  it("flags a too-long custom prefix", () => {
    const r = validateCreate(
      form({ prefixPreset: "custom", customPrefix: "x".repeat(17) }),
    );
    deepStrictEqual(r, { ok: false, field: "authPrefix" });
  });

  it("requires the API key", () => {
    const r = validateCreate(form({ apiKey: "" }));
    deepStrictEqual(r, { ok: false, field: "apiKey" });
  });

  it("rejects an over-long API key", () => {
    const r = validateCreate(form({ apiKey: "k".repeat(4097) }));
    deepStrictEqual(r, { ok: false, field: "apiKey" });
  });
});

describe("validateEdit", () => {
  it("sends only name + description when secrets are blank", () => {
    const r = validateEdit(
      editCustomForm({ name: "Acme CRM", description: "The Acme CRM API." }),
    );
    strictEqual(r.ok, true);
    if (r.ok)
      deepStrictEqual(r.patch, {
        name: "Acme CRM",
        description: "The Acme CRM API.",
      });
  });

  it("includes baseUrl, auth, and apiKey when the user fills them", () => {
    const base = editCustomForm({ name: "Acme", description: "desc" });
    const r = validateEdit({
      ...base,
      baseUrl: "https://api.new.com",
      headerName: "X-Api-Key",
      prefixPreset: "none",
      apiKey: "rotated",
    });
    strictEqual(r.ok, true);
    if (r.ok)
      deepStrictEqual(r.patch, {
        name: "Acme",
        description: "desc",
        baseUrl: "https://api.new.com",
        auth: { type: "header", header: "X-Api-Key" },
        apiKey: "rotated",
      });
  });

  it("omits auth when the header name is left blank", () => {
    const base = editCustomForm({ name: "Acme", description: "desc" });
    const r = validateEdit({ ...base, apiKey: "rotated" });
    strictEqual(r.ok, true);
    if (r.ok) {
      strictEqual("auth" in r.patch, false);
      strictEqual(r.patch.apiKey, "rotated");
    }
  });

  it("flags a filled but invalid base URL", () => {
    const base = editCustomForm({ name: "Acme", description: "desc" });
    const r = validateEdit({ ...base, baseUrl: "http://insecure.com" });
    deepStrictEqual(r, { ok: false, field: "baseUrl" });
  });

  it("flags an emptied name", () => {
    const base = editCustomForm({ name: "", description: "desc" });
    deepStrictEqual(validateEdit(base), { ok: false, field: "name" });
  });
});

describe("form factories", () => {
  it("emptyCustomForm defaults to a bearer Authorization header", () => {
    const v = emptyCustomForm();
    strictEqual(v.authType, "header");
    strictEqual(v.headerName, "Authorization");
    strictEqual(v.prefixPreset, "bearer");
  });

  it("editCustomForm prefills name + description and blanks secrets", () => {
    const v = editCustomForm({ name: "N", description: "D" });
    strictEqual(v.name, "N");
    strictEqual(v.description, "D");
    strictEqual(v.baseUrl, "");
    strictEqual(v.headerName, "");
    strictEqual(v.apiKey, "");
  });
});
