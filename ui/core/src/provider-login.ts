/**
 * Stable sentinel strings the engine adapter puts in
 * `ProviderLoginComplete.error` (see `HoustonEvent` in ./types) for its own
 * client-side timeouts. They double as the English default copy (this package
 * stays i18n-agnostic); the app maps them to localized toast text — matching
 * by value, so these are a CONTRACT: change one here and the app-side mapping
 * (app/src/lib/provider-login-error.ts) must move with it.
 */
export const PROVIDER_LOGIN_TIMEOUT_ERROR = "Login timed out";
export const PROVIDER_CONNECT_TIMEOUT_ERROR =
  "Connection timed out. Please try connecting again.";
/** Substituted by the engine adapter when the runtime reports a typed login
 *  failure of kind `codex_callback_port_busy` (the Codex OAuth callback port
 *  preflight), so the app can localize it like the timeouts above. */
export const PROVIDER_LOGIN_PORT_BUSY_ERROR =
  "Another app on this computer is using the sign-in port. Close other AI coding tools and try again.";
/** Substituted by the runtime when GitHub's Copilot token exchange answers
 *  403 `no_copilot_access` after the device flow (an account with no Copilot
 *  subscription; GitHub's raw body carries the user's handle and must never
 *  reach the toast). Mirrors `COPILOT_NO_ACCESS_ERROR` in
 *  packages/runtime/src/auth/login.ts — matched by value, keep in sync. */
export const PROVIDER_COPILOT_NO_ACCESS_ERROR =
  "Your GitHub account doesn't have Copilot access yet. Enable GitHub Copilot on github.com (the Free plan works), then try connecting again.";
