import { afterEach, beforeEach, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({
  native: false,
  getAuth: vi.fn(() => ({ kind: "auth" })),
  initializeAuth: vi.fn(() => ({ kind: "auth" })),
  setPersistence: vi.fn(() => Promise.resolve()),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock("firebase/auth", () => ({
  browserLocalPersistence: { type: "LOCAL" },
  getAuth: auth.getAuth,
  initializeAuth: auth.initializeAuth,
  setPersistence: auth.setPersistence,
}));
vi.mock("@houston/app/lib/os-bridge/platform", () => ({
  osIsNativeMobile: () => auth.native,
}));

const config = { apiKey: "key", authDomain: "auth.test", projectId: "p" };

beforeEach(() => {
  vi.resetModules();
  auth.getAuth.mockClear();
  auth.initializeAuth.mockClear();
});

afterEach(() => {
  auth.native = false;
});

// The popup resolver loads Google's gapi script, which throws an opaque
// cross-origin "Script error." for the native shell's capacitor: origin.
test("the native shell initializes Auth without the popup resolver", async () => {
  auth.native = true;
  const { initWebAuth } = await import("./firebase-auth-instance.ts");
  initWebAuth(config);
  expect(auth.getAuth).not.toHaveBeenCalled();
  expect(auth.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
    persistence: { type: "LOCAL" },
  });
});

test("a browser keeps the SDK default Auth with popup sign-in", async () => {
  const { initWebAuth } = await import("./firebase-auth-instance.ts");
  initWebAuth(config);
  initWebAuth(config);
  expect(auth.getAuth).toHaveBeenCalledTimes(1);
  expect(auth.initializeAuth).not.toHaveBeenCalled();
});
