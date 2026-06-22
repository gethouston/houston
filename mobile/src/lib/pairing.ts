// Redeem a phone-access code with the Houston relay. The code is of the form
// `<tunnelId>-<accessSecret>` and comes from the desktop QR.
//
// Success: relay returns `{ok, engineToken, deviceLabel}`. We persist
// `{baseUrl, engineToken, deviceLabel, tunnelId}` to Preferences and
// call `initEngine(...)`. Mobile boot reads this on next launch.

import { initEngine } from "./engine";
import { savePaired } from "./storage";

export interface RelayConfig {
  /** e.g. "https://tunnel.gethouston.ai" or "https://tunnel-staging.gethouston.ai" */
  baseUrl: string;
}

// Mirror of `engine/houston-engine-server/src/config.rs::DEFAULT_RELAY_URL`.
// Must stay in sync — mobile dials `{baseUrl}/pair/<code>`, engine's tunnel
// client dials `{baseUrl}/e/<tunnelId>/register`. Both addresses live on
// the same Worker, so the host string has to match.
const DEFAULT_RELAY = "https://tunnel.gethouston.ai";

export function relayConfig(): RelayConfig {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return {
    baseUrl: env?.VITE_RELAY_URL?.trim() || DEFAULT_RELAY,
  };
}

/** Stable wire codes mirrored from `houston-relay/src/types.ts::PairErrorCode`.
 * `network` is the one client-only value — fetch throw, not surfaced by
 * the server. `internal` is the default fallback when the server responds
 * with a non-OK but emits no recognized code. */
export type PairErrorCode =
  | "desktop_offline"
  | "pair_timeout"
  | "code_unknown"
  | "code_malformed"
  | "internal"
  | "network";

const KNOWN_CODES: ReadonlySet<PairErrorCode> = new Set<PairErrorCode>([
  "desktop_offline",
  "pair_timeout",
  "code_unknown",
  "code_malformed",
  "internal",
  "network",
]);

function normalizeErrorCode(v: unknown): PairErrorCode {
  return typeof v === "string" && KNOWN_CODES.has(v as PairErrorCode)
    ? (v as PairErrorCode)
    : "internal";
}

export class PairError extends Error {
  constructor(
    msg: string,
    public readonly status: number,
    public readonly code: PairErrorCode,
  ) {
    super(msg);
  }

  /** Transient codes should be retried; fatal codes should not. Mirrors
   * the retry policy in `redeemPairingCode`. */
  get retryable(): boolean {
    return (
      this.code === "network" ||
      this.code === "desktop_offline" ||
      this.code === "pair_timeout"
    );
  }
}

export function parseCode(
  raw: string,
): { tunnelId: string; accessSecret: string } | null {
  const trimmed = raw.trim();
  // Accept: "abc123-842759" OR a full URL "https://tunnel.../pair/abc123-842759"
  const code = trimmed.includes("/pair/")
    ? (trimmed.split("/pair/")[1]?.split(/[?#]/)[0] ?? "")
    : trimmed;
  // tunnelId is base64url (hyphens allowed); accessSecret is the suffix.
  // Split on the LAST dash.
  const dash = code.lastIndexOf("-");
  if (dash < 0) return null;
  const tunnelId = code.slice(0, dash);
  const accessSecret = code.slice(dash + 1);
  if (!tunnelId || !accessSecret) return null;
  return { tunnelId, accessSecret };
}

interface RelayErrorBody {
  ok?: boolean;
  code?: string;
  error?: string;
}

async function readRelayError(res: Response): Promise<RelayErrorBody> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as RelayErrorBody;
  } catch {
    return { error: text };
  }
}

/** One attempt at redeeming the code. Throws `PairError` on any failure. */
async function attemptRedeem(
  url: string,
  deviceLabel: string,
): Promise<{
  engineToken: string;
  deviceLabel: string;
}> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceLabel }),
    });
  } catch (e) {
    throw new PairError(
      `Could not reach the Houston relay. ${e instanceof Error ? e.message : ""}`,
      0,
      "network",
    );
  }
  if (!res.ok) {
    const body = await readRelayError(res);
    const code = normalizeErrorCode(body.code);
    console.warn("[pairing] non-2xx", {
      status: res.status,
      code,
      body,
    });
    throw new PairError(body.error || res.statusText, res.status, code);
  }

  const body = (await res.json()) as {
    ok: boolean;
    engineToken?: string;
    deviceLabel?: string;
    error?: string;
    code?: string;
  };
  if (!body.ok || !body.engineToken) {
    console.warn("[pairing] 200 but body.ok=false", body);
    throw new PairError(
      body.error || "Pairing rejected.",
      400,
      normalizeErrorCode(body.code),
    );
  }
  return {
    engineToken: body.engineToken,
    deviceLabel: body.deviceLabel ?? deviceLabel,
  };
}

/** Redeem with retries on transient errors (D).
 *
 * Retries `network`, `desktop_offline`, and `pair_timeout` with
 * exponential backoff (1s, 2s, 4s). Fatal codes (`code_unknown`,
 * `code_malformed`) bail immediately so the user can rescan the current QR
 * instead of waiting through pointless retries. */
export async function redeemPairingCode(
  rawCode: string,
  deviceLabel: string,
): Promise<void> {
  const parsed = parseCode(rawCode);
  if (!parsed)
    throw new PairError("Invalid pairing code.", 400, "code_malformed");

  const { baseUrl } = relayConfig();
  const url = `${baseUrl.replace(/\/+$/, "")}/pair/${parsed.tunnelId}-${parsed.accessSecret}`;

  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [1_000, 2_000, 4_000];
  let lastErr: PairError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const out = await attemptRedeem(url, deviceLabel);
      const paired = {
        baseUrl: `${baseUrl.replace(/\/+$/, "")}/e/${parsed.tunnelId}`,
        engineToken: out.engineToken,
        deviceLabel: out.deviceLabel,
        tunnelId: parsed.tunnelId,
        pairedAt: new Date().toISOString(),
      };
      savePaired(paired);
      initEngine(paired);
      return;
    } catch (e) {
      if (!(e instanceof PairError)) throw e;
      lastErr = e;
      if (!e.retryable || attempt === MAX_ATTEMPTS - 1) break;
      console.warn(
        `[pairing] attempt ${attempt + 1} failed (code=${e.code}), retrying in ${BACKOFF_MS[attempt]}ms`,
      );
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  throw lastErr!;
}
