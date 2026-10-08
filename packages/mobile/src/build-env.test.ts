import { expect, test } from "vitest";
import { mobileBuildEnv } from "./build-env";

test("mobile builds require a cloud gateway", () => {
  expect(() => mobileBuildEnv({})).toThrow("VITE_CONTROL_PLANE_URL");
});

test("mobile builds require the public Firebase key that renders sign-in", () => {
  expect(() =>
    mobileBuildEnv({ VITE_CONTROL_PLANE_URL: "https://gateway.gethouston.ai" }),
  ).toThrow("FIREBASE_API_KEY");
});

test("mobile deploy environment defaults to production and validates overrides", () => {
  const gateway = "https://gateway.gethouston.ai";
  expect(
    mobileBuildEnv({
      VITE_CONTROL_PLANE_URL: gateway,
      FIREBASE_API_KEY: "public-key",
    }),
  ).toEqual({
    controlPlaneUrl: gateway,
    deployEnvironment: "production",
    updateBaseUrl: "",
    updatePublicKey: "",
    storeUrlIos: "",
    storeUrlAndroid: "",
  });
  expect(
    mobileBuildEnv({
      VITE_CONTROL_PLANE_URL: gateway,
      FIREBASE_API_KEY: "public-key",
      HOUSTON_MOBILE_DEPLOY_ENV: "preview",
    }).deployEnvironment,
  ).toBe("preview");
  expect(() =>
    mobileBuildEnv({
      VITE_CONTROL_PLANE_URL: gateway,
      FIREBASE_API_KEY: "public-key",
      HOUSTON_MOBILE_DEPLOY_ENV: "staging",
    }),
  ).toThrow("HOUSTON_MOBILE_DEPLOY_ENV");
});

test("OTA requires HTTPS and a release channel when configured", () => {
  const common = {
    VITE_CONTROL_PLANE_URL: "https://gateway.gethouston.ai",
    FIREBASE_API_KEY: "public-key",
  };
  expect(() =>
    mobileBuildEnv({
      ...common,
      HOUSTON_MOBILE_UPDATE_BASE_URL: "http://updates.example",
    }),
  ).toThrow("HOUSTON_MOBILE_UPDATE_BASE_URL");
  expect(() =>
    mobileBuildEnv({
      ...common,
      HOUSTON_MOBILE_DEPLOY_ENV: "development",
      HOUSTON_MOBILE_UPDATE_BASE_URL: "https://updates.example",
      HOUSTON_MOBILE_UPDATE_PUBKEY: "public-key",
    }),
  ).toThrow("OTA requires");
});
