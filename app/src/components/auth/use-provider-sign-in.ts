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

export function useProviderSignIn() {
  const { t } = useTranslation("errors");
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => cancelPendingAuthorize, []);

  useEffect(() => {
    return onAuthError((code) => {
      setPending(null);
      setError(t(authErrorKey(code)));
    });
  }, [t]);

  const handleSignIn = (provider: Provider) => async () => {
    setPending(provider);
    setError(null);
    identityClient.cancelAccountLink();
    const opts = { onBrowserOpened: () => setPending(null) };
    try {
      await SIGN_IN_BY_PROVIDER[provider](opts);
    } catch (e) {
      logger.error(`[auth] ${provider} sign-in failed: ${e}`);
      setError(t(authErrorKey(e)));
    } finally {
      setPending(null);
    }
  };

  return { pending, error, handleSignIn };
}
