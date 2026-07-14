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
