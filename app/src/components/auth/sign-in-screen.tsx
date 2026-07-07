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
import { GoogleIcon, MicrosoftIcon } from "./provider-brand-icons";
import { SpaceBackground } from "./space-background";

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
    <div className="relative flex h-screen flex-col bg-[var(--ht-space-canvas)] text-foreground">
      <SpaceBackground />

      <div className="relative z-10 flex items-center gap-2 px-8 pt-14 pb-6 text-[var(--ht-space-foreground)]">
        <HoustonLogo size={24} />
        <span className="text-lg font-semibold tracking-tight">Houston</span>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        {/* data-theme="light" pins the whole card to the light palette so it
            reads identically in both app themes (white card on the
            theme-invariant space backdrop). */}
        <div
          data-theme="light"
          className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-border shadow-2xl sm:grid-cols-3"
        >
          <div className="flex flex-col gap-5 bg-background p-8 sm:col-span-2">
            <h1 className="text-lg font-medium">Log in</h1>

            <div className="flex flex-col gap-2.5">
              <Button
                variant="default"
                onClick={handleSignIn("google")}
                disabled={pending !== null}
                className="h-10 w-full justify-center rounded-full shadow-none"
              >
                {pending === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </Button>
              <Button
                variant="default"
                onClick={handleSignIn("azure")}
                disabled={pending !== null}
                className="h-10 w-full justify-center rounded-full shadow-none"
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

          <div className="flex flex-col justify-between gap-6 bg-primary p-8 text-primary-foreground sm:col-span-1">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-medium">Share the love</h2>
              <p className="text-sm text-primary-foreground/70">
                Refer a company to Houston for Teams. If they commit to 5 or
                more licenses, you get $250 in credits for your own company.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={openExternal("https://gethouston.ai/referrals")}
              className="-ml-3 gap-1 self-start text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              See how it works
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-3 py-6 text-xs text-[var(--ht-space-foreground-muted)]">
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/privacy")}
          className="underline-offset-4 hover:text-[var(--ht-space-foreground)] hover:underline"
        >
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={openExternal("https://gethouston.ai/terms")}
          className="underline-offset-4 hover:text-[var(--ht-space-foreground)] hover:underline"
        >
          Terms of Service
        </button>
      </div>
    </div>
  );
}
