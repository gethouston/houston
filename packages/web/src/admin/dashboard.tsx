import { initFrontendLogging } from "@houston/app/lib/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BillingReport,
  fetchBilling,
  fetchOverview,
  type Overview,
} from "./api";
import { OrphansPanel, SpendPanel, StatCards, UsersTable } from "./components";
import { AdminSignIn } from "./sign-in";
import { btn, C, ghostBtn, page } from "./styles";
import { useAdminAuth } from "./use-admin-auth";

// The /admin entry (packages/web/src/main.tsx) renders this dashboard directly,
// NOT through app-tree.tsx, so it must install the identity log sink + window
// error logging itself — otherwise the admin sign-in's identity-module discards
// (e.g. a malformed ID token) would only reach console. Idempotent + safe on web
// (the underlying write is a no-op shim there).
initFrontendLogging();

/**
 * Houston Cloud operator dashboard (served at /admin). Self-contained, like the
 * cloud-login gate: signs the operator in with GCIP (Firebase Auth) — email +
 * password or Google — then reads the control plane's cross-tenant pod + spend
 * views with the operator's Firebase ID token. The control plane's
 * CP_ADMIN_USER_IDS allowlist is the real gate; the UI just shows the 403/404
 * reason if this account isn't an operator.
 */
const REFRESH_MS = 15_000;

export function AdminDashboard({
  controlPlaneUrl,
}: {
  controlPlaneUrl: string;
}) {
  const auth = useAdminAuth();
  if (!auth.token) return <AdminSignIn auth={auth} />;
  return (
    <Dashboard
      controlPlaneUrl={controlPlaneUrl}
      token={auth.token}
      signOut={auth.signOut}
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
  signOut: () => Promise<void>;
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
  }, [load]);

  return (
    <div style={page}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            Houston Cloud · Operations
          </div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            {loadedAt
              ? `Updated ${new Date(loadedAt).toLocaleTimeString()}`
              : "Loading…"}
            {busy ? " · refreshing" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={btn}
            onClick={() => void load()}
            disabled={busy}
          >
            Refresh
          </button>
          <button type="button" style={ghostBtn} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: `${C.red}1a`,
            border: `1px solid ${C.red}55`,
            color: C.red,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {overview ? (
          <>
            <StatCards overview={overview} />
            {billing && (
              <SpendPanel billing={billing} days={days} onDays={setDays} />
            )}
            <UsersTable overview={overview} billing={billing} />
            <OrphansPanel overview={overview} />
          </>
        ) : (
          !error && (
            <div style={{ color: C.dim, marginTop: 24 }}>
              Loading cluster state…
            </div>
          )
        )}
      </div>
    </div>
  );
}
