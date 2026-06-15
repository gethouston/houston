import { useEffect, useState } from "react";
import { Button, Separator } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";
import { onAuthError, signInWithGoogle } from "../../lib/auth";
import { reportBug } from "../../lib/bug-report";
import { logger } from "../../lib/logger";
import { prettifyAuthError } from "./auth-errors";
import { EmailSignIn } from "./email-sign-in";

// Microsoft is intentionally not offered for now. The generic `azure`
// provider plumbing stays in lib/auth.ts (signInWithMicrosoft) so re-enabling
// is just re-adding the button below.
type Provider = "google";

/**
 * Full-screen sign-in overlay. Rendered by App.tsx when Supabase is
 * configured but no session is present. Keeps copy product-benefit-focused
 * — the audience is non-technical, so no mention of OAuth / tokens / APIs.
 *
 * Two ways in: Google (OAuth via the loopback flow) and passwordless email
 * (6-digit code, fully in-app — see EmailSignIn).
 *
 * Re-click semantics: the loading spinner is only on while the system
 * browser is being opened (a few ms). After that, the user is free to
 * click any provider again — useful when they land on the wrong browser
 * profile and need to retry. The PKCE flow is regenerated each click.
 */
export function SignInScreen() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Send logs to support" affordance — for non-technical alpha users
  // who can't reach the in-app Settings → Report Bug flow because they're
  // stuck on this screen. Three states: idle / sending / sent.
  const [logsStatus, setLogsStatus] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [logsIssueId, setLogsIssueId] = useState<string | null>(null);

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
      await signInWithGoogle();
    } catch (e) {
      logger.error(`[auth] ${provider} sign-in failed: ${e}`);
      setError(prettifyAuthError(String(e)));
    } finally {
      // Re-enable the button immediately once the browser is open. The
      // SignInScreen itself unmounts when the deep-link callback flips the
      // session, so we don't need a "waiting for callback" loading state.
      setPending(null);
    }
  };

  const handleSendLogs = async () => {
    setLogsStatus("sending");
    try {
      const issueId = await reportBug({
        command: "signin_screen_stuck",
        error:
          "User reported they are stuck on the sign-in screen and could not reach the in-app Report Bug flow. Logs attached from the SignInScreen send-logs button.",
        userEmail: null,
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
      });
      setLogsIssueId(issueId);
      setLogsStatus("sent");
    } catch (e) {
      logger.error(`[auth] send-logs failed: ${e}`);
      setLogsStatus("idle");
      setError(
        `Could not send logs automatically: ${e instanceof Error ? e.message : String(e)}. Email them to support manually.`,
      );
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <HoustonLogo size={48} />
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Welcome to Houston</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to save your agents and keep everything in sync.
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={handleSignIn("google")}
            disabled={pending !== null}
            className="w-full rounded-full h-11 flex items-center justify-center gap-2"
          >
            <GoogleIcon />
            {pending === "google" ? "Opening browser..." : "Continue with Google"}
          </Button>
        </div>

        <div className="flex items-center gap-3 w-full">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <EmailSignIn />

        <p className="text-xs text-muted-foreground text-center">
          Wrong browser profile? Just click again to retry.
        </p>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}

        {/* Last-resort "send logs" affordance for non-technical alpha users
         * stuck on this screen. The in-app Settings → Report Bug flow is
         * unreachable until they're signed in, so we expose the same
         * report_bug command here with a fixed description. Hardcoded
         * English / Spanish copy because this whole screen is currently
         * English-only and adding i18n is its own scope. */}
        <div className="mt-2 flex flex-col items-center gap-1">
          {logsStatus === "sent" ? (
            <p className="text-xs text-muted-foreground text-center">
              Logs sent to support
              {logsIssueId ? ` (ref ${logsIssueId})` : ""}. Thanks, we'll
              follow up.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleSendLogs()}
              disabled={logsStatus === "sending"}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              {logsStatus === "sending"
                ? "Sending logs..."
                : "Stuck? Send logs to support / ¿Atascado? Enviar logs a soporte"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

