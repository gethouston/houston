import { afterEach, expect, test, vi } from "vitest";
import { publishMobileSurface } from "./surface";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// The shell imports app modules (the updater's error reporting, boot error
// reports) before the web entry runs. `app/src/lib/engine.ts` resolves its
// endpoint once, at evaluation, so the shell's own globals must already name
// the gateway or the engine gate waits forever.
test("an app module evaluated right after the shell globals reaches a ready engine", async () => {
  const target: Partial<Window> = {};
  vi.stubGlobal("window", target);
  publishMobileSurface(target, {
    platform: "ios",
    deployEnvironment: "production",
    controlPlaneUrl: "https://gateway.example.test",
  });
  const engine = await import("@houston/app/lib/engine");
  expect(engine.isEngineReady()).toBe(true);
  expect(target.__HOUSTON_ENGINE__?.baseUrl).toBe(
    "https://gateway.example.test",
  );
  // Evaluating the real engine module graph takes seconds on a cold cache.
}, 30_000);
