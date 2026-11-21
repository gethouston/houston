import { afterEach, expect, test, vi } from "vitest";
import { publishMobileSurface } from "./surface";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

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
}, 30_000);
