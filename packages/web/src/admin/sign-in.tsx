import type { CSSProperties } from "react";
import { useState } from "react";
import { btn, C, page } from "./styles";
import type { AdminAuth } from "./use-admin-auth";

const input: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #34343f",
  background: C.panel2,
  color: C.text,
};

/**
 * Operator sign-in gate. Google SSO (popup) or email + password — both GCIP
 * (Firebase). Operator accounts are provisioned by the platform admin; there is
 * no self-signup here.
 */
export function AdminSignIn({ auth }: { auth: AdminAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, ready } = auth;

  return (
    <div
      style={{
        ...page,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 340,
          padding: 28,
          borderRadius: 16,
          background: C.panel,
          border: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700 }}>Houston Cloud · Ops</div>
        <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
          {ready ? "Operator sign in." : "Loading…"}
        </div>
        <button
          type="button"
          style={btn}
          onClick={() => void auth.signInGoogle()}
          disabled={busy}
        >
          Continue with Google
        </button>
        <div style={{ textAlign: "center", opacity: 0.4, fontSize: 12 }}>
          or
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void auth.signInPassword(email, password);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <input
            style={input}
            type="email"
            placeholder="you@gethouston.ai"
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
          <button
            style={{ ...btn, background: "#26262f" }}
            type="submit"
            disabled={busy || !email || !password}
          >
            Sign in with email
          </button>
        </form>
        {error && <div style={{ color: C.red, fontSize: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
