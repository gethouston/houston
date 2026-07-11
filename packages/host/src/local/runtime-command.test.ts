import { describe, expect, test } from "vitest";
import { runtimeCommand } from "./runtime-command";

describe("runtimeCommand", () => {
  test("uses an explicit env command first", () => {
    expect(
      runtimeCommand({
        env: { HOUSTON_RUNTIME_COMMAND: "node /app/dist/runtime/main.mjs" },
      }),
    ).toEqual(["node", "/app/dist/runtime/main.mjs"]);
  });

  test("spawns the desktop sidecar binary when present", () => {
    expect(
      runtimeCommand({
        env: { HOUSTON_SIDECAR_BINARY: "/Applications/Houston/host" },
      }),
    ).toEqual(["/Applications/Houston/host"]);
  });

  test("uses the sibling runtime bundle when running from dist", () => {
    expect(
      runtimeCommand({
        env: {},
        execPath: "/usr/local/bin/node",
        moduleUrl: "file:///app/dist/host/main.mjs",
        exists: (path) => path === "/app/dist/runtime/main.mjs",
      }),
    ).toEqual(["/usr/local/bin/node", "/app/dist/runtime/main.mjs"]);
  });

  test("falls back to source through tsx in dev", () => {
    expect(
      runtimeCommand({
        env: {},
        execPath: "/usr/local/bin/node",
        moduleUrl: "file:///repo/packages/host/src/local/runtime-command.ts",
        exists: () => false,
      }),
    ).toEqual([
      "/usr/local/bin/node",
      "--import",
      "tsx",
      "/repo/packages/runtime/src/main.ts",
    ]);
  });
});
