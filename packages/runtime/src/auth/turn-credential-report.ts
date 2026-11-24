import {
  currentTurnCredentialChannel,
  type TurnCredentialChannel,
} from "./turn-credential-channel";
import { currentUsedTokenDigest } from "./used-token";

export const TURN_REPORT_TIMEOUT_MS = 10_000;

export type TurnCredentialHealthReport =
  | "needs_reconnect"
  | "out_of_credits"
  | "connected";

const pending = new WeakMap<TurnCredentialChannel, Set<Promise<void>>>();
const healthSent = new WeakMap<TurnCredentialChannel, Set<string>>();

export function trackTurnCredentialReport(
  channel: TurnCredentialChannel,
  work: Promise<unknown>,
): void {
  let inflight = pending.get(channel);
  if (!inflight) {
    inflight = new Set();
    pending.set(channel, inflight);
  }
  const settled: Promise<void> = work.then(
    () => {
      inflight.delete(settled);
    },
    () => {
      inflight.delete(settled);
    },
  );
  inflight.add(settled);
}

export async function settleTurnCredentialReports(
  channel: TurnCredentialChannel | undefined,
): Promise<void> {
  if (!channel) return;
  for (;;) {
    const inflight = pending.get(channel);
    if (!inflight?.size) return;
    await Promise.all(inflight);
  }
}

function credentialUrl(channel: TurnCredentialChannel): string {
  return `${channel.baseUrl.replace(/\/+$/, "")}/v1/pod/credentials/${encodeURIComponent(channel.orgSlug)}/${encodeURIComponent(channel.agentSlug)}/${encodeURIComponent(channel.provider)}`;
}

function channelHeaders(
  channel: TurnCredentialChannel,
  extra: Record<string, string>,
): Record<string, string> {
  return {
    Authorization: `Bearer ${channel.hostToken}`,
    ...(channel.actingAs ? { "x-houston-acting-as": channel.actingAs } : {}),
    "x-houston-credential-scope": channel.scope,
    ...extra,
  };
}

export async function removeTurnCredentialIfAccess(
  channel: TurnCredentialChannel,
  accessSha256: string,
): Promise<boolean> {
  const res = await fetch(credentialUrl(channel), {
    method: "DELETE",
    headers: channelHeaders(channel, {
      "x-houston-if-access-sha256": accessSha256,
    }),
    signal: AbortSignal.timeout(TURN_REPORT_TIMEOUT_MS),
  });
  if (!res.ok)
    throw new Error(`credential gateway DELETE answered ${res.status}`);
  return (await answerField(res, "removed")) === true;
}

export function reportTurnCredentialHealth(
  kind: TurnCredentialHealthReport,
  provider: string,
  seen: { resetsAt?: string | null; usedAccessDigest?: string } = {},
): void {
  const channel = currentTurnCredentialChannel();
  if (!channel || channel.provider !== provider) return;
  if (kind === "connected" && !channel.health) return;
  const accessSha256 =
    seen.usedAccessDigest ??
    (channel.kind === "oauth" ? currentUsedTokenDigest(provider) : undefined) ??
    channel.accessSha256;
  if (!accessSha256) return;
  let sent = healthSent.get(channel);
  if (!sent) {
    sent = new Set();
    healthSent.set(channel, sent);
  }
  const dedupe = `${kind}:${accessSha256}`;
  if (sent.has(dedupe)) return;
  sent.add(dedupe);
  trackTurnCredentialReport(
    channel,
    postHealth(channel, kind, accessSha256, seen.resetsAt).catch((error) => {
      sent.delete(dedupe);
      console.warn(
        `[turn-credential] ${kind} report for ${provider} failed:`,
        error instanceof Error ? error.message : error,
      );
    }),
  );
}

async function postHealth(
  channel: TurnCredentialChannel,
  kind: TurnCredentialHealthReport,
  accessSha256: string,
  resetsAt: string | null | undefined,
): Promise<void> {
  const res = await fetch(credentialUrl(channel), {
    method: "POST",
    headers: channelHeaders(channel, { "content-type": "application/json" }),
    body: JSON.stringify({
      kind,
      accessSha256,
      ...(kind === "out_of_credits" && isoInstant(resetsAt)
        ? { resetsAt: isoInstant(resetsAt) }
        : {}),
    }),
    signal: AbortSignal.timeout(TURN_REPORT_TIMEOUT_MS),
  });
  if (!res.ok)
    throw new Error(`credential gateway POST answered ${res.status}`);
  const changed = (await answerField(res, "changed")) === true;
  console.log(
    `[turn-credential] reported ${kind} for ${channel.provider}: ${
      changed ? "recorded" : "superseded, left in place"
    }`,
  );
}

async function answerField(res: Response, field: string): Promise<unknown> {
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    console.warn(
      `[turn-credential] the credential gateway answered ${res.status} with a non-JSON body, reading '${field}' as false: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  return typeof body === "object" && body !== null && field in body
    ? (body as Record<string, unknown>)[field]
    : undefined;
}

function isoInstant(value: string | null | undefined): string | undefined {
  const at = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(at) ? undefined : new Date(at).toISOString();
}
