import { expect, test } from "vitest";
import { publishMobileSurface } from "./surface";

const surface = {
  platform: "ios",
  deployEnvironment: "preview",
  controlPlaneUrl: "https://gateway.example.test",
} as const;

test("native surface, baked environment and gateway host mode are published together", () => {
  const globals: Partial<Window> = {};
  publishMobileSurface(globals, surface);
  expect(globals).toEqual({
    __HOUSTON_SURFACE__: "ios",
    __HOUSTON_DEPLOY_ENV__: "preview",
    __HOUSTON_CP__: true,
    __HOUSTON_ENGINE__: { baseUrl: "https://gateway.example.test", token: "" },
  });
});

test("an unsupported platform or a missing gateway publishes nothing", () => {
  const globals: Partial<Window> = {};
  expect(() =>
    publishMobileSurface(globals, { ...surface, platform: "web" }),
  ).toThrow("Unsupported native mobile platform");
  expect(() =>
    publishMobileSurface(globals, { ...surface, controlPlaneUrl: "" }),
  ).toThrow("Missing mobile control plane URL");
  expect(globals).toEqual({});
});
