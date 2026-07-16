import type {
  AuthCredential,
  AuthStorage,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, test, vi } from "vitest";
import { readAnthropicToken } from "./read-token";

/** A minimal AuthStorage stub: only `get("anthropic")` is exercised. */
function store(cred: AuthCredential | undefined): Pick<AuthStorage, "get"> {
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
  // token via CLAUDE_CODE_OAUTH_TOKEN exactly like a setup token.
  const token = readAnthropicToken(
    store({
      type: "oauth",
      access: " sk-ant-oat01-served \n",
      refresh: "",
      expires: Date.now() + 60 * 60 * 1000,
    }),
  );
  expect(token).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-served" });
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
  expect(token).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-x" });
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
  const bogus = { type: "wat" } as unknown as AuthCredential;
  expect(readAnthropicToken(store(bogus))).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("expected api_key or oauth"),
  );
});
