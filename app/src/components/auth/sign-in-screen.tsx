import { Button } from "@houston-ai/core";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  onAuthError,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../lib/auth";
import { logger } from "../../lib/logger";
import { tauriSystem } from "../../lib/tauri";
import { HoustonLogo } from "../shell/experience-card";
import { prettifyAuthError } from "./auth-errors";
import { EmailSignIn } from "./email-sign-in";

type Provider = "google" | "azure";

const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

/**
 * Full-screen sign-in overlay. Rendered by App.tsx when Supabase is
 * configured but no session is present (the local account login), and by the
 * cloud engine gate (HostedEngineGate) for the remote-connection login. Keeps
 * copy product-benefit-focused — the audience is non-technical, so no mention
 * of OAuth / tokens / APIs.
 *
 * Two-panel card: the LEFT panel is the sign-in itself (Google, Microsoft, and
 * passwordless email — the 6-digit code stays fully in-app); the RIGHT panel is
 * a calm value note on a muted surface. Wordmark sits top-left of the screen and
 * the legal links anchor the footer.
 *
 * Re-click semantics: the provider spinner is only on while the system browser
 * is being opened (a few ms). After that the user is free to click again — the
 * PKCE flow is regenerated each click.
 */
export function SignInScreen() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Surface OAuth errors that happen AFTER the browser hands off (provider
  // rejection, code-exchange failure, identity already linked to another
  // user). Without this the user only saw the "kick off" failure path and
  // every post-callback failure was invisible.
  useEffect(() => {
    return onAuthError((message) => {
      setPending(null);
      setError(prettifyAuthError(message));
    });
  }, []);

  const handleSignIn = (provider: Provider) => async () => {
    setPending(provider);
    setError(null);
    try {
      await (provider === "azure" ? signInWithMicrosoft() : signInWithGoogle());
    } catch (e) {
      logger.error(`[auth] ${provider} sign-in failed: ${e}`);
      setError(prettifyAuthError(String(e)));
    } finally {
      // Re-enable the buttons immediately once the browser is open. The
      // SignInScreen itself unmounts when the deep-link callback flips the
      // session, so we don't need a "waiting for callback" loading state.
      setPending(null);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 px-8 pt-10 pb-6">
        <HoustonLogo size={24} />
        <span className="text-lg font-semibold tracking-tight">Houston</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border shadow-sm sm:grid-cols-3">
          <div className="flex flex-col gap-5 bg-card p-8 sm:col-span-2">
            <h1 className="text-xl font-medium">Log in</h1>

            <div className="flex flex-col gap-2.5">
              <Button
                variant="outline"
                onClick={handleSignIn("google")}
                disabled={pending !== null}
                className="h-10 w-full justify-center rounded-full"
              >
                {pending === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </Button>
              <Button
                variant="outline"
                onClick={handleSignIn("azure")}
                disabled={pending !== null}
                className="h-10 w-full justify-center rounded-full"
              >
                {pending === "azure" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MicrosoftIcon />
                )}
                Continue with Microsoft
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <EmailSignIn />

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex flex-col gap-3 bg-muted p-8 sm:col-span-1">
            <h2 className="text-base font-semibold">Houston for teams</h2>
            <p className="text-sm text-muted-foreground">
              Shared agents, roles, and admin controls for your whole company.
            </p>
            <button
              type="button"
              onClick={openExternal("https://gethouston.ai/enterprise")}
              className="mt-1 inline-flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline"
            >
              Talk to our team
              <ArrowUpRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 py-6 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/privacy")}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/terms")}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Terms of Service
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  // The official four-square mark. Brand colours are the buttons' only accent.
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
