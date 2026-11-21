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
  return "oauth_login";
}
