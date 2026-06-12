/**
 * Sandbox-only email/password login screen.
 *
 * Shown by <CloudGate> when VITE_HOUSTON_CLOUD_MODE=1 and there's no
 * Supabase session yet. Sign-up confirms the email immediately (sandbox
 * project has email confirmation disabled), then bubbles up so CloudGate
 * can kick off provisioning.
 *
 * NOT i18n-enabled — sandbox feature, hardcoded English. Add t() if this
 * ever surfaces in a shipping build.
 */

import { useState } from "react";
import { Button } from "@houston-ai/core";
import { supabase } from "../../lib/supabase";
import { logger } from "../../lib/logger";

type Mode = "signIn" | "signUp";

export function CloudLoginScreen({
  onSignedIn,
}: {
  onSignedIn: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (mode === "signUp") {
        const { error: authErr } = await supabase.auth.signUp({ email, password });
        if (authErr) throw authErr;
      } else {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authErr) throw authErr;
      }
      // Wait for the gate to wire the engine + tenant before flipping the
      // button back. Without this await, the user could click around in
      // the (re-rendered) app before the engine singleton is updated.
      await onSignedIn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[cloud-login] ${mode} failed: ${msg}`);
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Houston Cloud (sandbox)</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signIn"
              ? "Sign in to connect to your tenant engine."
              : "Create an account. A tenant pod will be provisioned in the kind cluster on your machine."}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            disabled={pending}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            disabled={pending}
          />
        </label>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? mode === "signUp" ? "Creating account..." : "Signing in..."
            : mode === "signUp" ? "Sign up" : "Sign in"}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          disabled={pending}
        >
          {mode === "signIn"
            ? "No account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
