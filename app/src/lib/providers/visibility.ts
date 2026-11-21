import type { Capabilities } from "@houston/engine-adapter";
import { defaultModelFor } from "./build-provider.ts";
import { PROVIDERS } from "./catalog.ts";
import { providerName } from "./lookup.ts";
import type { ProviderInfo } from "./types.ts";

export const EMPTY_PROVIDER_CAPABILITIES: Pick<
  Capabilities,
  "providers" | "openaiCompatible"
> = Object.freeze({
  providers: [],
  openaiCompatible: false,
});

interface ProviderVisibilityOpts {
  newEngine: boolean;
  desktop?: boolean;
  capabilities?: Pick<Capabilities, "providers" | "openaiCompatible">;
}

function showOpenaiCompatible(opts: ProviderVisibilityOpts): boolean {
  if (!opts.newEngine) return false;
  if (opts.capabilities) return opts.capabilities.openaiCompatible === true;
  return !!opts.desktop;
}

export function getVisibleProviders(
  opts: ProviderVisibilityOpts,
): readonly ProviderInfo[] {
  return PROVIDERS.filter((p) => {
    if (p.auth === "openaiCompatible") return showOpenaiCompatible(opts);
    return true;
  });
}

const OPENCODE_ACCOUNT: ProviderInfo = {
  id: "opencode",
  name: "OpenCode",
  subtitle: "Zen models or the Go subscription, one key",
  installUrl: "https://opencode.ai/auth",
  cost: "Pay as you go, or $10 / month with Go",
  auth: "apiKey",
  apiKeyUrl: "https://opencode.ai/auth",
  gatewayIds: ["opencode", "opencode-go"],
  models: [],
  defaultModel: defaultModelFor("opencode", []),
};

export function getConnectProviders(
  opts: ProviderVisibilityOpts,
): readonly ProviderInfo[] {
  const out: ProviderInfo[] = [];
  let mergedOpenCode = false;
  for (const p of getVisibleProviders(opts)) {
    if (p.id === "opencode" || p.id === "opencode-go") {
      if (!mergedOpenCode) {
        out.push(OPENCODE_ACCOUNT);
        mergedOpenCode = true;
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

export function providerGatewayIds(p: ProviderInfo): readonly string[] {
  return p.gatewayIds ?? [p.id];
}

export function connectProviderName(
  connect: readonly ProviderInfo[],
  providerId: string,
): string {
  const card = connect.find((p) => providerGatewayIds(p).includes(providerId));
  return card?.name ?? providerName(providerId);
}
