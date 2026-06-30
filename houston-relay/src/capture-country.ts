// Signup-country capture.
//
// We can't report users by country: Google OAuth returns no location and
// the `handle_new_user` Postgres trigger that creates the profile row
// never sees the request IP. This route closes that gap.
//
// The client calls `POST /capture-country` once, right after sign-in,
// with the user's Supabase access token. The Worker reads the country
// Cloudflare already resolved for the request (`request.cf.country`) —
// server-side, so the user can't forge it — and stamps it onto their
// profile with the service role (idempotent: only when still null).
//
// No IP is ever read or stored; `request.cf.country` is pre-resolved by
// Cloudflare. Country only, which keeps this clear of GDPR PII handling.

import type { Env } from "./types";

/**
 * Cloudflare sets `request.cf.country` to an ISO 3166-1 alpha-2 code, or a
 * sentinel when it can't place the request: `"XX"` (unknown) / `"T1"`
 * (Tor). Map those — and anything empty or malformed — to null; otherwise
 * return the upper-cased two-letter code.
 */
export function normalizeCountry(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const c = raw.toUpperCase();
  if (c === "XX" || c === "T1") return null;
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return c;
}

/** Resolve the caller's user id from their Supabase access token by asking
 * GoTrue. Returns null on any auth failure (caller maps that to 401). */
async function resolveUserId(env: Env, token: string): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

/**
 * `POST /capture-country` — stamp the signed-in user's profile with the
 * country Cloudflare resolved for this request. Auth: the user's Supabase
 * access token in `Authorization: Bearer`. Idempotent and tamper-proof.
 */
export async function handleCaptureCountry(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }
  // Needs both the project URL and the service-role key. If the relay
  // isn't configured for capture (e.g. local/miniflare), say so plainly
  // rather than pretending success — the client treats this as best-effort.
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const token = (request.headers.get("authorization") ?? "")
    .replace(/^bearer\s+/i, "")
    .trim();
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const userId = await resolveUserId(env, token);
  if (!userId) return Response.json({ ok: false, error: "invalid_token" }, { status: 401 });

  // `request.cf` is loosely typed here; normalizeCountry validates the
  // value at runtime, so a cast to string is safe.
  const country = normalizeCountry((request.cf?.country ?? null) as string | null);
  if (!country) {
    // Authenticated, but Cloudflare couldn't place the request. Nothing to
    // store — leave the row null rather than writing a bogus value.
    return Response.json({ ok: true, stored: false });
  }

  // Idempotent: the `signup_country=is.null` filter means only the first
  // successful call stamps the row; re-logins never overwrite it. The
  // service-role key bypasses RLS, so the stored value is the one the
  // Worker derived server-side — a client can't PATCH its own country.
  const patch = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&signup_country=is.null`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ signup_country: country, country_source: "cf_worker" }),
    },
  );
  if (!patch.ok) {
    return Response.json({ ok: false, error: `profiles_patch_${patch.status}` }, { status: 502 });
  }
  return Response.json({ ok: true, stored: true });
}
