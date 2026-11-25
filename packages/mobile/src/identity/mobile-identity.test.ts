import { afterEach, beforeEach, expect, test, vi } from "vitest";

const native = vi.hoisted(() => ({ signOut: vi.fn() }));
const js = vi.hoisted(() => ({ webSignOut: vi.fn() }));
const reported = vi.hoisted(() => vi.fn());

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: native,
}));
vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError: reported,
}));
vi.mock("../../../web/src/identity/firebase-popup", () => ({
  initWebAuth: vi.fn(),
  toSession: vi.fn(),
  webCurrentSession: vi.fn(),
  webOnIdTokenChanged: vi.fn(),
  webRefreshIdToken: vi.fn(),
  webSignInWithCustomToken: vi.fn(),
  webSignOut: js.webSignOut,
}));
vi.mock("../../../web/src/identity/firebase-auth-instance", () => ({
  ready: vi.fn(),
}));
vi.mock("../../../web/src/identity/firebase-session", () => ({
  backfillAccountProfile: vi.fn(),
  toOutcome: vi.fn(),
}));
vi.mock("./native-config", () => ({ nativeIdentity: { providers: {} } }));

const { NATIVE_SIGN_OUT_TIMEOUT_MS, webSignOut } =
  await import("./mobile-identity");

beforeEach(() => {
  native.signOut.mockReset();
  js.webSignOut.mockReset().mockResolvedValue(undefined);
  reported.mockReset();
});
afterEach(() => vi.useRealTimers());

test("sign-out also ends the native Google/Apple session", async () => {
  native.signOut.mockResolvedValue(undefined);
  await webSignOut();
  expect(js.webSignOut).toHaveBeenCalledOnce();
  expect(native.signOut).toHaveBeenCalledOnce();
  expect(reported).not.toHaveBeenCalled();
});

test("a hung native sign-out is bounded and reported, never fatal", async () => {
  vi.useFakeTimers();
  native.signOut.mockReturnValue(new Promise(() => {}));
  const done = webSignOut();
  await vi.advanceTimersByTimeAsync(NATIVE_SIGN_OUT_TIMEOUT_MS);
  await expect(done).resolves.toBeUndefined();
  expect(reported).toHaveBeenCalledWith("native_sign_out", expect.any(Error));
});

test("a failed JS sign-out still ends the native session, then rethrows", async () => {
  native.signOut.mockResolvedValue(undefined);
  js.webSignOut.mockRejectedValue(new Error("keychain"));
  await expect(webSignOut()).rejects.toThrow("keychain");
  expect(native.signOut).toHaveBeenCalledOnce();
});
