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

test("a wrong-variant (oauth) stored credential returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const oauth = {
    type: "oauth",
    access: "x",
    refresh: "",
    expires: 0,
  } as unknown as AuthCredential;
  expect(readAnthropicToken(store(oauth))).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("expected api_key"),
  );
});
