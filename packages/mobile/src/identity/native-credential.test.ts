import type { SignInResult } from "@capacitor-firebase/authentication";
import { describe, expect, test } from "vitest";
import { nativeCredential } from "./native-credential";

const result = (credential: Record<string, string>): SignInResult =>
  ({ credential }) as SignInResult;

describe("native Firebase credential handoff", () => {
  test("Google uses the provider ID token", () => {
    const credential = nativeCredential(
      "google",
      result({ idToken: "google-id" }),
    );
    expect(credential.providerId).toBe("google.com");
    expect(credential.toJSON()).toMatchObject({ idToken: "google-id" });
  });

  test("Apple carries its original nonce into the JS credential", () => {
    const credential = nativeCredential(
      "apple",
      result({ idToken: "apple-id", nonce: "raw-nonce" }),
    );
    expect(credential.providerId).toBe("apple.com");
    expect(credential.toJSON()).toMatchObject({
      idToken: "apple-id",
      nonce: "raw-nonce",
    });
  });

  test("a missing provider token or Apple nonce fails closed", () => {
    expect(() => nativeCredential("google", result({}))).toThrow();
    expect(() =>
      nativeCredential("apple", result({ idToken: "apple-id" })),
    ).toThrow();
  });
});
