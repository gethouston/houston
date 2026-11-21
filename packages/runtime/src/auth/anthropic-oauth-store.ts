import { authStorage } from "./storage";

export interface AnthropicOauthEntry {
  access: string;
  refresh: string;
  expires: number;
}

export function storeAnthropicOauth(entry: AnthropicOauthEntry): void {
  authStorage.set("anthropic", {
    type: "oauth",
    access: entry.access,
    refresh: entry.refresh,
    expires: entry.expires,
  });
}
