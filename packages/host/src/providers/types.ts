import type { ProviderId } from "@houston/protocol";

export type ProviderAuthMethod = "oauth" | "apiKey" | "openaiCompatible";

export interface HostProvider {
  id: ProviderId;
  name: string;
  auth: ProviderAuthMethod;
  cloud: boolean;
  models?: readonly string[];
  defaultModel?: string;
}
