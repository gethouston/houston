import { Button } from "@houston-ai/core";
import { isTauri } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useState } from "react";
import {
  completeSignInFromPaste,
  onAuthError,
  signInWithGoogle,
} from "../../lib/auth";
import { reportBug } from "../../lib/bug-report";
import { logger } from "../../lib/logger";
import { HoustonLogo } from "../shell/experience-card";

// Microsoft sign-in is temporarily disabled in the UI while the Azure
// App Registration + Supabase azure-provider settings are sorted out.
// The handler in `auth.ts` (`signInWithMicrosoft`) stays exported so
// re-enabling is a one-line revert here.
type Provider = "google";

/**
 * Full-screen sign-in overlay. Rendered by App.tsx when Supabase is
 * configured but no session is present (the local account login), and by the
 * cloud engine gate (HostedEngineGate) for the remote-connection login. Keeps
 * copy product-benefit-focused — the audience is non-technical, so no mention
 * of OAuth / tokens / APIs.
 *
 * `allowManualCallback` (HOU-621) surfaces the paste-the-code fallback. The
 * cloud/remote gate passes it always (the connecting build may not own the
 * `houston://` scheme and can't receive the deep-link callback); the local
 * account login passes it only in dev builds (#146: a dev callback opens the
 * installed prod app), so production standalone shows no manual step.
 *
 * Re-click semantics: the loading spinner is only on while the system
 * browser is being opened (a few ms). After that, the user is free to
 * click any provider again — useful when they land on the wrong browser
 * profile and need to retry. The PKCE flow is regenerated each click.
 */
export function SignInScreen({
  allowManualCallback = false,
}: {
  allowManualCallback?: boolean;
}) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Send logs to support" affordance — for non-technical alpha users
  // who can't reach the in-app Settings → Report Bug flow because they're
  // stuck on this screen. Three states: idle / sending / sent.
  const [logsStatus, setLogsStatus] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [logsIssueId, setLogsIssueId] = useState<string | null>(null);
  // Dev-only manual completion (the `houston://` deep link opens the installed
  // production app, so a dev build never receives the callback).
  const [devCode, setDevCode] = useState("");
  const [devExchanging, setDevExchanging] = useState(false);

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

  const handleDevPaste = async (e: FormEvent) => {
    e.preventDefault();
    setDevExchanging(true);
    setError(null);
    try {
      await completeSignInFromPaste(devCode);
      // Success swaps the session and unmounts this screen; a failure already
      // surfaced through the onAuthError subscription into `error`.
    } finally {
      setDevExchanging(false);
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
            {pending === "google"
              ? "Opening browser..."
              : "Continue with Google"}
          </Button>
        </div>

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
              {logsIssueId ? ` (ref ${logsIssueId})` : ""}. Thanks, we'll follow
              up.
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

        {/* Manual sign-in completion for the cloud/remote flow (HOU-621). The
         * `houston://auth-callback` deep link routes to the INSTALLED app that
         * owns the `houston` scheme, which is not necessarily the build that is
         * pointed at the remote engine (e.g. a `pnpm start` dev build alongside
         * the installed production app). Paste the code (or the full callback
         * URL) the browser landed on to finish the PKCE exchange locally. Only
         * rendered when the caller opts in via `allowManualCallback` — the local
         * standalone flow never shows it. */}
        {allowManualCallback && isTauri() && (
          <form
            onSubmit={(e) => void handleDevPaste(e)}
            className="mt-2 w-full flex flex-col gap-2 border-t border-border pt-4"
          >
            <p className="text-xs text-muted-foreground text-center">
              Dev: the callback opens the production app. Paste the code (or the
              full callback URL) from the browser here.
            </p>
            <input
              value={devCode}
              onChange={(e) => setDevCode(e.target.value)}
              placeholder="code or https://gethouston.ai/auth/callback?code=..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-xs"
            />
            <Button
              type="submit"
              disabled={!devCode.trim() || devExchanging}
              className="w-full rounded-full h-9 text-xs"
            >
              {devExchanging ? "Completing sign-in..." : "Complete dev sign-in"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Map raw provider / Supabase error strings to a short, actionable
 * sentence. The original message is appended in parentheses so support
 * still has the technical detail when triaging from logs.
 */
function prettifyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("identity") && msg.includes("already")) {
    return "That email is already signed in with another provider. Use the original sign-in option, or contact support to merge accounts.";
  }
  if (msg.includes("aadsts50020") || msg.includes("does not exist in tenant")) {
    return "Your Microsoft account isn't allowed in this Houston workspace. Try a different account, or ask your admin to invite it.";
  }
  if (
    msg.includes("aadsts700016") ||
    msg.includes("application with identifier")
  ) {
    return "Microsoft sign-in isn't fully configured for Houston yet. Please contact support.";
  }
  if (msg.includes("aadsts65001") || msg.includes("consent")) {
    return "Microsoft needs admin consent before this account can sign in. Ask your IT admin to approve Houston, then try again.";
  }
  if (msg.includes("redirect") && msg.includes("invalid")) {
    return "The sign-in callback URL isn't allow-listed. Please contact support.";
  }
  if (msg.includes("provider") && msg.includes("not enabled")) {
    return "This sign-in option isn't turned on for Houston yet. Try the other provider.";
  }
  if (msg.includes("authorization code")) {
    return "Sign-in didn't complete cleanly. Please try again.";
  }
  // Fallback: show the raw message so the user has something to copy
  // when reporting. Keep it bounded so the UI doesn't blow up.
  const trimmed = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  return `Sign-in failed: ${trimmed}`;
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
