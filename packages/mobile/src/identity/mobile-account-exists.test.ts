import { FirebaseError } from "firebase/app";
import { expect, test, vi } from "vitest";

const nativeCred = vi.hoisted(() => ({
  providerId: "google.com",
  idToken: "g-id",
}));
const fb = vi.hoisted(() => ({
  signInWithCredential: vi.fn(),
  linkWithCredential: vi.fn(),
}));

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signInWithGoogle: async () => ({ credential: { idToken: "g-id" } }),
  },
}));
vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  linkWithCredential: fb.linkWithCredential,
  signInWithCredential: fb.signInWithCredential,
}));
vi.mock("./native-config", () => ({
  nativeIdentity: { providers: { google: true } },
}));
vi.mock("./native-credential", () => ({ nativeCredential: () => nativeCred }));
vi.mock("../../../web/src/identity/firebase-popup", () => ({
  initWebAuth: vi.fn(),
  toSession: vi.fn(),
  webCurrentSession: vi.fn(),
  webOnIdTokenChanged: vi.fn(),
  webRefreshIdToken: vi.fn(),
  webSignInWithCustomToken: vi.fn(),
  webSignOut: vi.fn(),
}));
vi.mock("../../../web/src/identity/firebase-auth-instance", () => ({
  ready: async () => ({ kind: "auth" }),
  requireAuth: () => ({ currentUser: { uid: "uid-a" } }),
}));
vi.mock("../../../web/src/identity/firebase-session", () => ({
  backfillAccountProfile: vi.fn(),
  toOutcome: vi.fn(),
  toSession: async () => ({ uid: "uid-a", idToken: "linked" }),
}));

const { webLinkPending, webSignInWithGoogle } = await import(
  "./mobile-identity"
);

test("a native sign-in that meets an existing account holds the native credential", async () => {
  fb.signInWithCredential.mockRejectedValue(
    new FirebaseError(
      "auth/account-exists-with-different-credential",
      "account exists",
      { email: "p@example.com" },
    ),
  );
  const pending = await webSignInWithGoogle();
  if (!pending || !("kind" in pending)) throw new Error("expected a link");
  expect([pending.provider, pending.email]).toEqual([
    "google.com",
    "p@example.com",
  ]);

  fb.linkWithCredential.mockResolvedValue({ user: { uid: "uid-a" } });
  const session = { uid: "uid-a", idToken: "email" } as Parameters<
    typeof webLinkPending
  >[1];
  expect(await webLinkPending(pending.handle, session)).toEqual({
    kind: "linked",
    session: { uid: "uid-a", idToken: "linked", provider: "google.com" },
  });
  expect(fb.linkWithCredential).toHaveBeenCalledWith(
    { uid: "uid-a" },
    nativeCred,
  );
});
