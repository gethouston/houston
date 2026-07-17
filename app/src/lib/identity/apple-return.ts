// The gateway's Apple return-bridge URL (pure + Tauri-free so the unit runner
// can import it). The full bridge contract is pinned in `apple-authorize.ts`.

/** Gateway bridge path Apple's `form_post` lands on (contract of record). */
export const APPLE_RETURN_PATH = "/v1/auth/apple/return";

/** The HTTPS bridge URL used as the `createAuthUri` `continueUri`. */
export function appleReturnUrl(gatewayBaseUrl: string): string {
  return `${gatewayBaseUrl.replace(/\/+$/, "")}${APPLE_RETURN_PATH}`;
}
