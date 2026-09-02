// Explicit `.ts` extension: `node --test --experimental-strip-types` loads
// this module directly (app/tests/warming-send-pin.test.ts).
import { normalizeLegacyModel } from "./providers.ts";

export interface WarmingPin {
  provider?: string;
  model?: string;
  effort?: string;
}

/** A mission row's stored pin, as the activity list returns it. */
export interface RowPin {
  provider?: string;
  model?: string;
}

/**
 * The pin a parked FOLLOW-UP flushes with (PRODUCT-1643). A follow-up queued
 * while the pod was asleep carried the composer's best guess — the agent
 * default whenever the mission's own row had not loaded yet. The row's pin is
 * what the picker shows once loaded, and nobody could have changed it while
 * parked (writes block during a warm-up), so it wins whenever it names a
 * provider. Legacy aliases are normalized like every other row read. The
 * send's effort survives either way: rows never store one.
 */
export function preferRowPin(
  row: RowPin | undefined,
  send: WarmingPin,
): WarmingPin {
  if (!row?.provider) return send;
  return {
    provider: row.provider,
    model: normalizeLegacyModel(row.model ?? null) ?? undefined,
    effort: send.effort,
  };
}

export async function verifyWarmingSendPin(args: {
  agentId: string;
  activityId?: string;
  pin: WarmingPin;
  timeoutMs?: number;
  probe: (agentId: string, provider: string) => Promise<boolean>;
  clearActivityPin: (agentId: string, activityId: string) => Promise<void>;
}): Promise<WarmingPin> {
  if (!args.pin.provider) return args.pin;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("provider-probe-timeout");
  let configured: boolean | typeof timedOut;
  try {
    configured = await Promise.race([
      args.probe(args.agentId, args.pin.provider),
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(resolve, args.timeoutMs ?? 3_000, timedOut);
      }),
    ]);
  } catch {
    return args.pin;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (configured === timedOut || configured) return args.pin;
  if (args.activityId)
    await args.clearActivityPin(args.agentId, args.activityId);
  return {};
}
