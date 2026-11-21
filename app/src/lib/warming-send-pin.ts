import { toDisplayProviderIdOrNull } from "./provider-overrides.ts";
import { normalizeLegacyModel } from "./providers.ts";

export interface WarmingPin {
  provider?: string;
  model?: string;
  effort?: string;
}

export interface RowPin {
  provider?: string;
  model?: string;
}

export function preferRowPin(
  row: RowPin | undefined,
  send: WarmingPin,
): WarmingPin {
  if (!row?.provider) return send;
  return {
    provider: toDisplayProviderIdOrNull(row.provider) ?? undefined,
    model: normalizeLegacyModel(row.model ?? null, row.provider) ?? undefined,
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
