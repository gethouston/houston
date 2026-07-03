/**
 * Pure gating logic for the Connect-phone settings section, split out so the
 * decision is unit-testable without rendering React (see
 * `app/tests/connect-phone-state.test.ts`).
 */

export interface TunnelReadiness {
  /** True only once the tunnel has allocated AND we're connected to the relay. */
  connected: boolean;
}

/**
 * Whether "Disconnect all phones" (reset access) may be invoked.
 *
 * Resetting rotates the QR and revokes paired phones via a relay round-trip,
 * which only succeeds once the tunnel has finished allocating and is connected.
 * Firing it earlier produced the raw `unavailable: Tunnel allocation hasn't
 * completed yet` error and an unhandled rejection (HOU-443). The frontend only
 * has `connected` to go on — when the tunnel is still allocating or the machine
 * is offline, `connected` is false — so we gate the action on it.
 */
export function canResetPhoneAccess(info: TunnelReadiness | null): boolean {
  return info?.connected === true;
}
