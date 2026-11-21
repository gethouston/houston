import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

const captured = vi.hoisted(() => ({
  transports: [] as (string | undefined)[],
}));

vi.mock("../backends/pi/backend", () => ({
  createPiBackend: (deps: { transport?: string }) => {
    captured.transports.push(deps.transport);
    return {
      id: "pi",
      createSession: () => {
        throw new Error("conversation-backends-transport.test runs no turn");
      },
    };
  },
}));

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cbt-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cbt-ws-"),
);

test("the server's pi backend names no transport, so pi keeps auto", async () => {
  await import("./conversation-backends");
  expect(captured.transports).toEqual([undefined]);
});
