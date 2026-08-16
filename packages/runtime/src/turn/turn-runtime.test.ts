import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { QWEN_REGIONS, qwenRegionFileIn } from "../ai/qwen-dashscope";
import { registerTurnProviders } from "./turn-runtime";

test("turn provider registration reads qwen region from the turn dataDir", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "turn-qwen-"));
  writeFileSync(qwenRegionFileIn(dataDir), JSON.stringify({ region: "us" }));
  const registrations: Array<{ id: string; baseUrl?: string }> = [];
  const runtime = {
    registerProvider: (id: string, config: { baseUrl?: string }) => {
      registrations.push({ id, baseUrl: config.baseUrl });
    },
    unregisterProvider: () => {},
    getRegisteredProviderConfig: () => undefined,
  };

  registerTurnProviders(runtime, dataDir);

  expect(registrations).toContainEqual({
    id: "qwen",
    baseUrl: QWEN_REGIONS[1].baseUrl,
  });
});
