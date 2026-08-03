/**
 * Which connect surface a provider reconnects through. Routing, not copy — the
 * card's state -> title/body/button mapping lives in `./auth-presentation`, the
 * lifecycle in `./use-provider-login`, and the dialogs in `./reconnect-dialog`.
 */

/**
 * Only OAuth providers have a browser sign-in; sending an api-key provider
 * through `launchLogin` is a guaranteed 400 ("nvidia does not use OAuth
 * sign-in") that flips the card to its failed phase and dead-ends the user
 * (HOU-1077) — those reconnect by re-pasting the key in the same connect dialog
 * settings uses. The local provider keeps its guided endpoint dialog.
 */
export type ReconnectSurface =
  | "oauth_login"
  | "api_key_dialog"
  | "local_model_dialog";

export function reconnectSurface(
  providerId: string,
  auth: "oauth" | "apiKey" | "openaiCompatible" | undefined,
): ReconnectSurface {
  if (providerId === "openai-compatible") return "local_model_dialog";
  if (auth === "apiKey") return "api_key_dialog";
  // OAuth — or an id the catalog doesn't resolve, where only the engine knows
  // the method: the engine-side launch keeps its own non-OAuth guard.
  return "oauth_login";
}
