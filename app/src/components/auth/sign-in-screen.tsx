import { Button, Separator } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  onAuthError,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../lib/auth";
import { logger } from "../../lib/logger";
import { HoustonLogo } from "../shell/experience-card";
import { prettifyAuthError } from "./auth-errors";
import { EmailSignIn } from "./email-sign-in";

type Provider = "google" | "azure";

/**
 * Full-screen sign-in overlay. Rendered by App.tsx when Supabase is
 * configured but no session is present (the local account login), and by the
 * cloud engine gate (HostedEngineGate) for the remote-connection login. Keeps
 * copy product-benefit-focused — the audience is non-technical, so no mention
 * of OAuth / tokens / APIs.
 *
 * Three equal ways in: Google, Microsoft (both OAuth via the loopback flow),
 * and passwordless email (6-digit code, fully in-app — see EmailSignIn). The
 * providers read as one calm set of outline buttons — the only colour is each
 * brand's own mark — rather than one heavy primary button dominating the rest.
 *
 * Re-click semantics: the loading spinner is only on while the system browser
 * is being opened (a few ms). After that the user is free to click a provider
 * again — the PKCE flow is regenerated each click.
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
    <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="flex flex-col items-center gap-7 max-w-xs w-full">
        <div className="flex flex-col items-center gap-4 text-center">
          <HoustonLogo size={44} />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold">Welcome to Houston</h1>
            <p className="text-sm text-muted-foreground text-balance">
              Sign in to save your agents and keep everything in sync.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              onClick={handleSignIn("google")}
              disabled={pending !== null}
              className="h-11 flex-1 rounded-full"
            >
              {pending === "google" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Google
            </Button>
            <Button
              variant="outline"
              onClick={handleSignIn("azure")}
              disabled={pending !== null}
              className="h-11 flex-1 rounded-full"
            >
              {pending === "azure" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MicrosoftIcon />
              )}
              Microsoft
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <EmailSignIn />
        </div>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
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
  // The official four-square mark. Brand colours are the screen's only accent.
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
