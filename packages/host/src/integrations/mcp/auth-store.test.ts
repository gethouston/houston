import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FileMcpAuthStore } from "./auth-store";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "mcp-auth-store-"));
}

test("round-trips OAuth state with an atomic 0600 file", async () => {
  const dir = tempDir();
  const store = new FileMcpAuthStore(dir);
  const state = {
    clientInformation: { client_id: "client-1" },
    tokens: { access_token: "access-1", token_type: "bearer" },
    codeVerifier: "verifier-1",
    pending: { state: "nonce-1", startedAtMs: 123 },
  };

  await store.write("rube", state);

  expect(await store.read("rube")).toEqual(state);
  const path = join(dir, "mcp-oauth", "rube.json");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(readdirSync(join(dir, "mcp-oauth"))).toEqual(["rube.json"]);

  // Replacing an existing file also restores strict permissions.
  chmodSync(path, 0o644);
  await store.write("rube", { tokens: state.tokens });
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("missing and corrupt OAuth files read as signed out", async () => {
  const dir = tempDir();
  const store = new FileMcpAuthStore(dir);
  expect(await store.read("missing")).toEqual({});

  mkdirSync(join(dir, "mcp-oauth"), { recursive: true });
  writeFileSync(join(dir, "mcp-oauth", "rube.json"), "not json");
  expect(await store.read("rube")).toEqual({});
});
