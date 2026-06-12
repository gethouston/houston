import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { fetchBilling, fetchOverview, type BillingReport, type Overview } from "./api";
import { StatCards, SpendPanel, UsersTable, OrphansPanel } from "./components";
import { btn, C, ghostBtn, page } from "./styles";

/**
 * Houston Cloud operator dashboard (served at /admin). Self-contained, like the
 * cloud-login gate: owns its own Supabase client, signs the operator in, then
 * reads the control plane's cross-tenant pod + spend views with their token. The
 * control plane's CP_ADMIN_USER_IDS allowlist is the real gate; the UI just shows
 * the 403/404 reason if this account isn't an operator.
 */
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const SUPABASE_URL = env.VITE_CP_SUPABASE_URL || "";
const SUPABASE_ANON = env.VITE_CP_SUPABASE_ANON_KEY || "";
const REFRESH_MS = 15_000;

/** The exact client type createClient returns, so it threads through props cleanly. */
type SupaClient = ReturnType<typeof createClient>;

export function AdminDashboard({ controlPlaneUrl }: { controlPlaneUrl: string }) {
  const supabase = useMemo<SupaClient>(() => createClient(SUPABASE_URL, SUPABASE_ANON), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (!session) return <SignIn supabase={supabase} ready={ready} />;
  return (
    <Dashboard
      controlPlaneUrl={controlPlaneUrl}
      token={session.access_token}
      signOut={() => supabase.auth.signOut()}
    />
  );
}

function Dashboard({
  controlPlaneUrl,
  token,
  signOut,
}: {
  controlPlaneUrl: string;
  token: string;
  signOut: () => Promise<{ error: { message: string } | null }>;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [billing, setBilling] = useState<BillingReport | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const daysRef = useRef(days);
  daysRef.current = days;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [ov, bill] = await Promise.all([
        fetchOverview(controlPlaneUrl, token),
        fetchBilling(controlPlaneUrl, token, daysRef.current),
      ]);
      setOverview(ov);
      setBilling(bill);
      setLoadedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [controlPlaneUrl, token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load, days]);

  // Sign-out surfaces failures: supabase returns { error }, and a transport
  // problem can reject — both reach the dashboard's error banner.
  const onSignOut = useCallback(async () => {
    try {
      const { error: e } = await signOut();
      if (e) setError(e.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [signOut]);

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Houston Cloud · Operations</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            {loadedAt ? `Updated ${new Date(loadedAt).toLocaleTimeString()}` : "Loading…"}
            {busy ? " · refreshing" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={() => void load()} disabled={busy}>Refresh</button>
          <button style={ghostBtn} onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: `${C.red}1a`, border: `1px solid ${C.red}55`, color: C.red, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {overview ? (
          <>
            <StatCards overview={overview} />
            {billing && <SpendPanel billing={billing} days={days} onDays={setDays} />}
            <UsersTable overview={overview} billing={billing} />
            <OrphansPanel overview={overview} />
          </>
        ) : (
          !error && <div style={{ color: C.dim, marginTop: 24 }}>Loading cluster state…</div>
        )}
      </div>
    </div>
  );
}

function SignIn({ supabase, ready }: { supabase: SupaClient; ready: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (msg: string) => {
    setError(msg);
    setBusy(false);
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/admin` },
    });
    if (error) fail(error.message);
  };

  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail(error.message);
  };

  const input: React.CSSProperties = {
    padding: "10px 12px", borderRadius: 10, border: `1px solid #34343f`, background: C.panel2, color: C.text,
  };
  return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 340, padding: 28, borderRadius: 16, background: C.panel, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Houston Cloud · Ops</div>
        <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>{ready ? "Operator sign in." : "Loading…"}</div>
        <button style={btn} onClick={google} disabled={busy}>Continue with Google</button>
        <div style={{ textAlign: "center", opacity: 0.4, fontSize: 12 }}>or</div>
        <form onSubmit={withPassword} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={input} type="email" placeholder="you@gethouston.ai" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input style={input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button style={{ ...btn, background: "#26262f" }} type="submit" disabled={busy || !email || !password}>Sign in with email</button>
        </form>
        {error && <div style={{ color: C.red, fontSize: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
