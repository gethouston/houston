import { expect, test } from "vitest";
import { authBootBreadcrumbs, providerAvailability } from "./availability";

const absent = {
  iosFirebase: false,
  androidFirebase: false,
  appleServiceId: "",
};

test("missing Firebase files leave only email sign-in", () => {
  expect(providerAvailability("ios", absent)).toEqual({
    google: false,
    apple: false,
    azure: false,
  });
  expect(providerAvailability("android", absent)).toEqual({
    google: false,
    apple: false,
    azure: false,
  });
  expect(authBootBreadcrumbs("ios", absent)[0]).toContain(
    "GoogleService-Info.plist",
  );
  expect(authBootBreadcrumbs("android", absent)[0]).toContain(
    "google-services.json",
  );
});

test("configured Google and Apple follow their platform requirements", () => {
  const files = {
    iosFirebase: true,
    androidFirebase: true,
    appleServiceId: "",
  };
  expect(providerAvailability("ios", files)).toEqual({
    google: true,
    apple: true,
    azure: false,
  });
  expect(providerAvailability("android", files)).toEqual({
    google: true,
    apple: false,
    azure: false,
  });
  expect(
    providerAvailability("android", {
      ...files,
      appleServiceId: "services.id",
    }),
  ).toEqual({ google: true, apple: true, azure: false });
  expect(authBootBreadcrumbs("android", files)[0]).toContain(
    "FIREBASE_APPLE_SERVICE_ID",
  );
});
