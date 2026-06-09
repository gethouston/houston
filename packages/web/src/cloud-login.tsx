import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { WebApp } from "./new-engine/app";

/**
 * Cloud login gate. Self-contained so it doesn't entangle app/src's own auth:
 * it owns a Supabase client (from VITE_ vars), signs the user in (Google or
 * email/password), and once there's a session it boots the desktop UI in
 * control-plane mode with the user's Supabase access token.
 *
 * The token is set on window.__HOUSTON_ENGINE__ BEFORE <WebApp> mounts, because
 * app/src/lib/engine.ts reads that global at module-eval to build its client.
 */
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const SUPABASE_URL = env.VITE_CP_SUPABASE_URL || "";
const SUPABASE_ANON = env.VITE_CP_SUPABASE_ANON_KEY || "";

const box: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0b0b0f",
  color: "#e7e7ea",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};
const card: React.CSSProperties = {
  width: 340,
  padding: 28,
  borderRadius: 16,
  background: "#15151c",
  border: "1px solid #26262f",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #34343f",
  background: "#7a5cff",
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
};
const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #34343f",
  background: "#0e0e13",
  color: "#e7e7ea",
};

/**
 * Floating profile chip pinned bottom-left of the cloud app: shows who's signed
 * in and lets them log out. Self-contained (a fixed overlay over <WebApp>) so it
 * doesn't entangle app/src's own shell.
 */
function CloudProfile({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const initial = (email.trim()[0] || "?").toUpperCase();
  return (
    <div
      style={{
        position: "fixed",
        left: 14,
        bottom: 14,
        zIndex: 2147483000,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 46,
            left: 0,
            width: 224,
            background: "#15151c",
            border: "1px solid #26262f",
            borderRadius: 12,
            padding: 8,
            boxShadow: "0 10px 34px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.5, padding: "4px 8px 0" }}>Signed in as</div>
          <div style={{ fontSize: 13, color: "#e7e7ea", padding: "2px 8px 10px", wordBreak: "break-all" }}>
            {email}
          </div>
          <button
            onClick={onLogout}
            style={{
              width: "100%",
              padding: "9px 10px",
              borderRadius: 8,
              border: "1px solid #34343f",
              background: "#26262f",
              color: "#ff9a9a",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Log out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title={email}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px 5px 5px",
          borderRadius: 999,
          background: "#15151c",
          border: "1px solid #26262f",
          color: "#e7e7ea",
          cursor: "pointer",
          boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            background: "#7a5cff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "white",
          }}
        >
          {initial}
        </span>
        <span
          style={{ fontSize: 12, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {email}
        </span>
      </button>
    </div>
  );
}

export function CloudApp({ controlPlaneUrl }: { controlPlaneUrl: string }) {
  const supabase = useMemo(() => createClient(SUPABASE_URL, SUPABASE_ANON), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Resolves an existing session and the OAuth redirect callback (supabase-js
    // reads the `?code=` off the URL on load), then tracks future changes.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Hand the token to the engine adapter before the app tree mounts.
  if (session) {
    window.__HOUSTON_ENGINE__ = { baseUrl: controlPlaneUrl, token: session.access_token };
    window.__HOUSTON_CP__ = true;
    const logout = async () => {
      await supabase.auth.signOut();
      window.location.reload(); // full reset back to the sign-in screen
    };
    return (
      <>
        <WebApp baseUrl={controlPlaneUrl} token={session.access_token} cloud />
        <CloudProfile email={session.user.email ?? "Account"} onLogout={logout} />
      </>
    );
  }

  const google = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Redirect to a /auth/callback PATH (not the bare origin): Supabase matches
      // it against the `http://<host>/**` allow-list entry, where a bare host often
      // fails to match. The SPA serves every path (nginx try_files), so the app
      // loads here and supabase-js exchanges the token out of the URL.
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  return (
    <div style={box}>
      <div style={card}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Houston Cloud</div>
        <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
          {ready ? "Sign in to your workspace." : "Loading…"}
        </div>
        <button style={btn} onClick={google} disabled={busy}>
          Continue with Google
        </button>
        <div style={{ textAlign: "center", opacity: 0.4, fontSize: 12 }}>or</div>
        <form onSubmit={withPassword} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            style={input}
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            style={input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button style={{ ...btn, background: "#26262f" }} type="submit" disabled={busy || !email || !password}>
            Sign in with email
          </button>
        </form>
        {error && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
