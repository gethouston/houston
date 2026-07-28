interface TunnelEndpoint {
  connected: boolean;
  publicHost: string | null;
}

/** Builds the pairing target only for an active tunnel with a fresh code. */
export function pairingUrl(
  info: TunnelEndpoint | null,
  pairingCode: string | null,
): string | null {
  if (!pairingCode || !info?.connected || !info.publicHost) return null;
  const protocol = info.publicHost.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${info.publicHost}/pair/${pairingCode}`;
}
