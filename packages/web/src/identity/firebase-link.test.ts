import type { Session } from "@houston/app/lib/identity";
import { FirebaseError } from "firebase/app";
import type { OAuthCredential } from "firebase/auth";
import { beforeEach, expect, test, vi } from "vitest";

const fb = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  linkWithCredential: vi.fn(),
}));

vi.mock("firebase/auth", () => ({ linkWithCredential: fb.linkWithCredential }));
vi.mock("./firebase-auth-instance.ts", () => ({
  requireAuth: () => ({ currentUser: fb.currentUser }),
}));
vi.mock("./firebase-session.ts", () => ({
  toSession: async (user: { uid: string }) => ({
    ...EMAIL_SESSION,
    uid: user.uid,
    idToken: "linked-id-token",
  }),
}));

const {
  holdAccountExists,
  isAccountExists,
  webDiscardPending,
  webLinkPending,
} = await import("./firebase-link.ts");

const EMAIL_SESSION: Session = {
  idToken: "email-id-token",
  refreshToken: "r",
  uid: "uid-a",
  email: "p@example.com",
  emailVerified: true,
  displayName: null,
  photoUrl: null,
  provider: "custom",
  expiresAt: 0,
};

const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;

// firebase-js-sdk tags the refusal with GCIP's whole answer, `localId` included.
const accountExists = (email?: string) =>
  new FirebaseError(
    "auth/account-exists-with-different-credential",
    "account exists",
    {
      ...(email ? { email } : {}),
      _tokenResponse: { needConfirmation: true, localId: "uid-a" },
    },
  );

const credential = (idToken?: string) =>
  ({ providerId: "microsoft.com", idToken }) as OAuthCredential;

beforeEach(() => {
  fb.currentUser = { uid: "uid-a" };
  fb.linkWithCredential.mockReset();
});

test("an account-exists refusal becomes a link for the address Firebase names", () => {
  const error = accountExists("p@example.com");
  expect(isAccountExists(error)).toBe(true);
  expect(isAccountExists(new FirebaseError("auth/popup-blocked", "x"))).toBe(
    false,
  );
  const pending = holdAccountExists(error, "microsoft.com", credential());
  expect({ ...pending, handle: typeof pending.handle }).toEqual({
    kind: "link_required",
    provider: "microsoft.com",
    email: "p@example.com",
    handle: "string",
    accountId: "uid-a",
  });
});

test("names no owner when Firebase withheld GCIP's answer", () => {
  const pending = holdAccountExists(
    new FirebaseError("auth/account-exists-with-different-credential", "x", {
      email: "p@example.com",
    }),
    "google.com",
    credential(),
  );
  expect(pending.accountId).toBeNull();
});

test("the provider's own token names the address when Firebase withholds it", () => {
  const pending = holdAccountExists(
    accountExists(),
    "apple.com",
    credential(jwt({ sub: "a-1", email: "relay@privaterelay.appleid.com" })),
  );
  expect(pending.email).toBe("relay@privaterelay.appleid.com");
});

test("no credential means no address, so the flow asks for the email code", async () => {
  const pending = holdAccountExists(
    accountExists("p@example.com"),
    "google.com",
    null,
  );
  expect(pending.email).toBeNull();
  expect(await webLinkPending(pending.handle, EMAIL_SESSION)).toEqual({
    kind: "expired",
  });
});

test("links the held credential onto the email-code session", async () => {
  const held = credential();
  const pending = holdAccountExists(
    accountExists("p@example.com"),
    "microsoft.com",
    held,
  );
  fb.linkWithCredential.mockResolvedValue({ user: { uid: "uid-a" } });
  const attempt = await webLinkPending(pending.handle, EMAIL_SESSION);
  expect(attempt).toEqual({
    kind: "linked",
    session: {
      ...EMAIL_SESSION,
      idToken: "linked-id-token",
      provider: "microsoft.com",
    },
  });
  expect(fb.linkWithCredential).toHaveBeenCalledWith(fb.currentUser, held);
});

test("an identity owned by another account is identity_taken", async () => {
  const pending = holdAccountExists(
    accountExists("p@example.com"),
    "google.com",
    credential(),
  );
  fb.linkWithCredential.mockRejectedValue(
    new FirebaseError("auth/credential-already-in-use", "taken"),
  );
  expect(await webLinkPending(pending.handle, EMAIL_SESSION)).toEqual({
    kind: "identity_taken",
  });
});

test("never links onto a user other than the email-code session", async () => {
  const pending = holdAccountExists(
    accountExists("p@example.com"),
    "google.com",
    credential(),
  );
  fb.currentUser = { uid: "uid-someone-else" };
  await expect(webLinkPending(pending.handle, EMAIL_SESSION)).rejects.toThrow(
    "the signed-in user is not the email-code session",
  );
  expect(fb.linkWithCredential).not.toHaveBeenCalled();
});

test("a provider refusing the held credential throws, so it is reported", async () => {
  const pending = holdAccountExists(
    accountExists("p@example.com"),
    "microsoft.com",
    credential(),
  );
  fb.linkWithCredential.mockRejectedValue(
    new FirebaseError("auth/invalid-credential", "rejected"),
  );
  await expect(
    webLinkPending(pending.handle, EMAIL_SESSION),
  ).rejects.toMatchObject({ name: "IdentityError" });
});

test("a discarded credential is expired", async () => {
  const pending = holdAccountExists(
    accountExists("p@example.com"),
    "google.com",
    credential(),
  );
  webDiscardPending(pending.handle);
  expect(await webLinkPending(pending.handle, EMAIL_SESSION)).toEqual({
    kind: "expired",
  });
});
