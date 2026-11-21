import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { config } from "../config";
import { writeAuthFile } from "./auth-file";

config.dataDir = mkdtempSync(join(tmpdir(), "houston-erg-boot-"));
config.controlPlaneUrl = "http://control-plane.test";
config.sandboxToken = "sbx-token";

writeAuthFile(join(config.dataDir, "auth.json"), {
  "openai-codex": {
    type: "oauth",
    access: "served-at",
    refresh: "",
    expires: Date.now() + 60_000,
  },
});

test("booting storage.ts in serve mode with an expiring served entry never reports the guard as unbound", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./storage");
  expect(report).not.toHaveBeenCalledWith(
    expect.stringContaining("no served sync is bound"),
  );
  report.mockRestore();
});
