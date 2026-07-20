import { afterEach, describe, expect, it } from "vitest";
import {
  buildStoreInstallDeepLink,
  buildWebAppInstallUrl,
  isValidSlug,
} from "./houston-launch";

describe("isValidSlug", () => {
  it("accepts well-formed slugs", () => {
    expect(isValidSlug("cool-agent")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("agent123")).toBe(true);
  });

  it("rejects malformed slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("has/slash")).toBe(false);
    expect(isValidSlug("x".repeat(65))).toBe(false);
  });
});

describe("buildStoreInstallDeepLink", () => {
  it("builds the store install deep link for a valid slug", () => {
    expect(buildStoreInstallDeepLink("cool-agent")).toBe(
      "houston://store/install?slug=cool-agent",
    );
  });

  it("returns null for an invalid slug", () => {
    expect(buildStoreInstallDeepLink("../evil")).toBeNull();
    expect(buildStoreInstallDeepLink("")).toBeNull();
  });
});

describe("buildWebAppInstallUrl", () => {
  const original = process.env.NEXT_PUBLIC_WEB_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_WEB_APP_URL;
    else process.env.NEXT_PUBLIC_WEB_APP_URL = original;
  });

  it("defaults to the production web app", () => {
    delete process.env.NEXT_PUBLIC_WEB_APP_URL;
    expect(buildWebAppInstallUrl("cool-agent")).toBe(
      "https://app.gethouston.ai/?install=cool-agent",
    );
  });

  it("honors NEXT_PUBLIC_WEB_APP_URL", () => {
    process.env.NEXT_PUBLIC_WEB_APP_URL = "https://preview.example.com";
    expect(buildWebAppInstallUrl("cool-agent")).toBe(
      "https://preview.example.com/?install=cool-agent",
    );
  });

  it("returns null for an invalid slug", () => {
    expect(buildWebAppInstallUrl("../evil")).toBeNull();
  });
});
