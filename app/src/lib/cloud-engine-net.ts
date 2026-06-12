/**
 * Network ops for cloud mode: tenants-row lookup, provision-tenant POST,
 * and the /v1/health probe that gates "ready" on the port-forward bridge.
 *
 * Sandbox-only utility for VITE_HOUSTON_CLOUD_MODE.
 */

import { supabase } from "./supabase";

export interface TenantConfig {
  baseUrl: string;
  token: string;
}

function provisionFunctionUrl(): string {
  return (
    (import.meta as any).env?.VITE_HOUSTON_PROVISION_URL ??
    "http://localhost:8000"
  );
}

/**
 * Look up the signed-in user's tenant row. Returns the engine config once
 * status='ready', or null if no row, 'pending', or 'failed'.
 */
export async function fetchTenantConfig(): Promise<TenantConfig | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("engine_url, engine_token, status")
    .maybeSingle();
  if (error) {
    throw new Error(`fetch tenants row: ${error.message}`);
  }
  if (!data) return null;
  if (data.status !== "ready") return null;
  if (!data.engine_url || !data.engine_token) return null;
  return { baseUrl: data.engine_url, token: data.engine_token };
}

/**
 * Bump the signed-in user's tenants row so the local PF watcher targets
 * THIS user's pod next tick. Without this, multi-tenant dev mode (only
 * one PF channel on localhost:7777) leaves the port pointed at whichever
 * tenant was created most recently — so re-signing-in as an earlier user
 * 401s against the wrong pod. The watcher orders by `updated_at desc`,
 * so a no-op update suffices to elect this tenant.
 *
 * In production with NGINX Ingress this is a no-op cost: rows are
 * already routed per-host/per-path, but bumping updated_at also gives
 * us a free "last seen" signal for tenant idle-shutdown later.
 */
export async function markTenantActive(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // `.select()` makes PostgREST return the updated rows in `data`. Without
  // it, a successful-but-zero-row UPDATE (RLS filtered everything) returns
  // `error=null` AND `data=null`, indistinguishable from success. With
  // `.select()`, RLS-blocked UPDATEs come back as `data === null` (or `[]`),
  // and we can throw — instead of silently doing nothing and leaving the
  // PF watcher stuck on the wrong tenant.
  const { data, error } = await supabase
    .from("tenants")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select();
  if (error) {
    throw new Error(`mark tenant active: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      "mark tenant active: 0 rows updated (RLS UPDATE policy missing on tenants?)",
    );
  }
}

/**
 * POST to the local provision-tenant function with the user's JWT. The
 * function awaits the K8s POSTs before returning, so once this resolves
 * the tenants row is already 'ready'.
 *
 * 409s from K8s (AlreadyExists) are absorbed by the function itself,
 * making re-invocation safe.
 */
export async function provisionTenant(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("not signed in — cannot provision tenant");
  }

  const res = await fetch(provisionFunctionUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`provision-tenant ${res.status}: ${body}`);
  }
}

/**
 * Poll /v1/health with the new token until it returns 200, so the gate
 * doesn't declare "ready" before the port-forward bridge catches up
 * (newly-provisioned pods take 5-15s for the watcher to detect and
 * forward to). Without this the first /v1/* request races an unbound
 * port (connect refused) or a stale tenant (401).
 */
export async function waitForEngineHealthy(
  config: TenantConfig,
  deadlineMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  let delay = 500;
  // Track the last non-success outcome so the timeout message points at
  // the actual reason (401 → wrong tenant; connect refused → PF watcher
  // is down; CORS → server misconfig). Without these, every failure
  // mode collapsed to the same generic "never returned 200" string.
  let lastStatus: number | null = null;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${config.baseUrl}/v1/health`, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (res.ok) return;
      lastStatus = res.status;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000);
  }
  const detail = lastStatus !== null
    ? `last status ${lastStatus}`
    : lastError instanceof Error
      ? `last error: ${lastError.message}`
      : "no responses received";
  throw new Error(
    `engine /v1/health never returned 200 (${detail}) — is the port-forward watcher running?`,
  );
}
