import type { Credential } from "@earendil-works/pi-ai";
import { accessDigest } from "@houston/protocol/access-digest";
import { beforeEach, expect, test, vi } from "vitest";
import type { HoustonAuthStore } from "../../auth/credential-store";
import { readAnthropicToken } from "./read-token";

/** A minimal credential-store stub: only `get("anthropic")` is exercised. */
function store(cred: Credential | undefined): Pick<HoustonAuthStore, "get"> {
  return { get: (id: string) => (id === "anthropic" ? cred : undefined) };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

test("a setup token (sk-ant-oat01…) maps to an oauth-token", () => {
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-oat01-abc" }),
  );
  expect(token).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-abc" });
});

test("a console API key (sk-ant-api03…) maps to an api-key", () => {
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-api03-xyz" }),
  );
  expect(token).toEqual({ kind: "api-key", value: "sk-ant-api03-xyz" });
});

test("surrounding whitespace is trimmed before mapping", () => {
  const token = readAnthropicToken(
    store({ type: "api_key", key: "  sk-ant-oat01-abc\n" }),
  );
  expect(token).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-abc" });
});

test("no stored credential returns undefined without warning (not connected)", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
});

test("an unrecognized token prefix returns undefined AND logs the reason", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(store({ type: "api_key", key: "junk-token" })),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("unrecognized prefix"),
  );
});

test("a served oauth credential maps its ACCESS token to an oauth-token", () => {
  // The connect-once serve path (managed cloud) writes pi's oauth variant with
  // a short-TTL access token and refresh="" — the SDK consumes the access
  // token via CLAUDE_CODE_OAUTH_TOKEN exactly like a setup token. It also
  // carries the access token's digest, captured HERE (spawn preparation) so a
  // revoked-token report can name the token the failed turn actually ran on
  // instead of whatever a re-serve stored since (PRODUCT-1319).
  const token = readAnthropicToken(
    store({
      type: "oauth",
      access: " sk-ant-oat01-served \n",
      refresh: "",
      expires: Date.now() + 60 * 60 * 1000,
    }),
  );
  expect(token).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-served",
    accessDigest: accessDigest("sk-ant-oat01-served"),
  });
});

test("a PASTED token (api_key-typed entry) carries NO access digest", () => {
  // Only OAUTH-typed store entries feed the revoked-token report (the
  // reporter's oauth gate, enforced at capture) — a pasted setup token stored
  // as api_key must stay digest-less even though it maps to an oauth-token env
  // var.
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-oat01-pasted" }),
  );
  expect(token?.kind).toBe("oauth-token");
  expect(token?.accessDigest).toBeUndefined();
});

test("an EXPIRED served oauth token is refused (falls back to the config dir)", () => {
  // The env token outranks the config dir's self-refreshing credential inside
  // the SDK — an expired served token must never shadow a working one.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-stale",
        refresh: "",
        expires: Date.now() - 1,
      }),
    ),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("expired"));
});

test("an oauth entry with NO recorded expiry (expires=0) is served as-is", () => {
  const token = readAnthropicToken(
    store({ type: "oauth", access: "sk-ant-oat01-x", refresh: "", expires: 0 }),
  );
  expect(token).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-x",
    accessDigest: accessDigest("sk-ant-oat01-x"),
  });
});

test("an oauth credential with an empty access token returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(
      store({ type: "oauth", access: "  ", refresh: "", expires: 0 }),
    ),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("empty access token"),
  );
});

test("an oauth credential with an unrecognized prefix returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(
      store({ type: "oauth", access: "junk", refresh: "", expires: 0 }),
    ),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("unrecognized prefix"),
  );
});

test("an unknown stored variant returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const bogus = { type: "wat" } as unknown as Credential;
  expect(readAnthropicToken(store(bogus))).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("expected api_key or oauth"),
  );
});
