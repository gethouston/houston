import { expect, test } from "vitest";
import { publishMobileSurface } from "./surface";

test("native surface and baked environment are published together", () => {
  const globals: {
    __HOUSTON_SURFACE__?: "ios" | "android";
    __HOUSTON_DEPLOY_ENV__?: "production" | "preview" | "development";
  } = {};
  publishMobileSurface(globals, "ios", "preview");
  expect(globals).toEqual({
    __HOUSTON_SURFACE__: "ios",
    __HOUSTON_DEPLOY_ENV__: "preview",
  });
  expect(() => publishMobileSurface(globals, "web", "production")).toThrow(
    "Unsupported native mobile platform",
  );
});
