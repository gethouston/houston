import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelPendingAuthorize,
  identityClient,
  onAuthError,
  signInWithApple,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../lib/auth";
import { logger } from "../../lib/logger";
import { authErrorKey } from "./auth-errors";
import type { Provider } from "./provider-button-row";

const SIGN_IN_BY_PROVIDER = {
  google: signInWithGoogle,
  apple: signInWithApple,
  azure: signInWithMicrosoft,
} as const;

/** The sign-in screen's provider buttons: which one is running, and the
 *  error line every provider failure lands on. */
export function useProviderSignIn() {
  const { t } = useTranslation("errors");
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancel any in-flight loopback authorize when this screen unmounts, so a late
  // browser completion can't overwrite a session the user established another way.
  useEffect(() => cancelPendingAuthorize, []);

  // Surface OAuth errors that happen AFTER the browser hands off (provider
  // rejection, code-exchange failure, identity already linked to another
  // user). Without this the user only saw the "kick off" failure path and
  // every post-callback failure was invisible. Post-hand-off failures arrive
  // as stable identity codes, resolved to localized copy here.
  useEffect(() => {
    return onAuthError((code) => {
      setPending(null);
      setError(t(authErrorKey(code)));
    });
  }, [t]);

  const handleSignIn = (provider: Provider) => async () => {
    setPending(provider);
    setError(null);
    identityClient.cancelAccountLink(); // clears a previous link's notice
    // `onBrowserOpened` re-enables the buttons the instant the system browser
    // opens, so the whole (up-to-300s) round-trip never freezes them.
    const opts = { onBrowserOpened: () => setPending(null) };
    try {
      await SIGN_IN_BY_PROVIDER[provider](opts);
    } catch (e) {
      logger.error(`[auth] ${provider} sign-in failed: ${e}`);
      setError(t(authErrorKey(e)));
    } finally {
      // Belt-and-suspenders for a PRE-browser failure (config / loopback bind),
      // where `onBrowserOpened` never fired. Post-browser, this is a no-op.
      setPending(null);
    }
  };

  return { pending, error, handleSignIn };
}
