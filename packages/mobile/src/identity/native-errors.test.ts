import { FirebaseError } from "firebase/app";
import { expect, test } from "vitest";
import { isNativeSignInCancel, mapNativeSignInError } from "./native-errors";

test("user-dismissed native sheets are benign", () => {
  expect(isNativeSignInCancel({ message: "Authorization canceled." })).toBe(
    true,
  );
  expect(isNativeSignInCancel({ message: "Sign in canceled." })).toBe(true);
  expect(
    isNativeSignInCancel({
      message: "com.apple.AuthenticationServices.AuthorizationError error 1001",
    }),
  ).toBe(true);
  expect(
    isNativeSignInCancel(
      new FirebaseError("auth/popup-closed-by-user", "closed"),
    ),
  ).toBe(true);
});

test("provider and network failures remain errors", () => {
  expect(isNativeSignInCancel({ code: "auth/network-request-failed" })).toBe(
    false,
  );
  expect(
    mapNativeSignInError({
      code: "auth/network-request-failed",
      message: "offline",
    }).code,
  ).toBe("network");
  expect(
    mapNativeSignInError({ code: "native-failure", message: "broken" }).code,
  ).toBe("unknown");
});
