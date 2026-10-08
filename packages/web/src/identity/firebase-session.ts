import { logAndReportError } from "@houston/app/lib/error-report";
import {
  type AuthProvider,
  decodeIdTokenClaims,
  type Session,
  type SignInOutcome,
} from "@houston/app/lib/identity";
import {
  getAdditionalUserInfo,
  type User,
  type UserCredential,
  updateProfile,
} from "firebase/auth";

const DEFAULT_TOKEN_TTL_MS = 3_600_000;

export async function toOutcome(cred: UserCredential): Promise<SignInOutcome> {
  return {
    session: await toSession(cred.user),
    isNewUser: getAdditionalUserInfo(cred)?.isNewUser === true,
  };
}

// GCIP only puts the account record's profile into ID token claims. The provider
// profile can fill missing values, then a refresh makes them visible immediately.
export async function backfillAccountProfile(
  user: User,
  nativeDisplayName?: string | null,
): Promise<void> {
  const provider = user.providerData[0];
  const patch: { photoURL?: string; displayName?: string } = {};
  if (!user.photoURL && provider?.photoURL) patch.photoURL = provider.photoURL;
  if (!user.displayName && (provider?.displayName || nativeDisplayName))
    patch.displayName = provider?.displayName || nativeDisplayName || undefined;
  if (!patch.photoURL && !patch.displayName) return;
  try {
    await updateProfile(user, patch);
    await user.getIdToken(true);
  } catch (error) {
    logAndReportError("account_profile_backfill", error);
  }
}

function toAuthProvider(providerId: string | undefined): AuthProvider {
  switch (providerId) {
    case "google.com":
      return "google.com";
    case "microsoft.com":
      return "microsoft.com";
    case "apple.com":
      return "apple.com";
    case "password":
      return "password";
    default:
      return "custom";
  }
}

export async function toSession(user: User): Promise<Session> {
  const idToken = await user.getIdToken();
  const exp = decodeIdTokenClaims(idToken)?.exp;
  const expiresAt =
    typeof exp === "number" ? exp * 1000 : Date.now() + DEFAULT_TOKEN_TTL_MS;
  return {
    idToken,
    refreshToken: user.refreshToken,
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    provider: toAuthProvider(user.providerData[0]?.providerId),
    expiresAt,
  };
}
