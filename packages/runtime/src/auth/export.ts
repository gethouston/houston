import { AZURE_OPENAI, azureBaseUrl } from "../ai/azure-openai";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import {
  authPathIn,
  type PiCred,
  readAuthFile,
  readServedProvidersAt,
  servedProvidersPathIn,
} from "./auth-file";

export type ExportedOAuthCredential = {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
};

export type ExportedApiKeyCredential = {
  provider: string;
  kind: "api_key";
  key: string;
  enterpriseUrl?: string;
};

export type ExportedCredential =
  | ExportedOAuthCredential
  | ExportedApiKeyCredential;

export type ExportOptions = {
  servedProviders?: ReadonlySet<string>;
};

export function selectExportCredential(
  auth: Record<string, PiCred>,
  provider?: string,
  opts?: ExportOptions,
): ExportedCredential | null {
  for (const [p, c] of Object.entries(auth)) {
    if (provider && p !== provider) continue;
    if (c?.type === "oauth" && c.access && c.refresh) {
      return {
        provider: p,
        access: c.access,
        refresh: c.refresh,
        expires: c.expires,
        accountId: c.accountId,
        enterpriseUrl: c.enterpriseUrl,
      };
    }
  }
  for (const [p, c] of Object.entries(auth)) {
    if (provider && p !== provider) continue;
    if (c?.type !== "api_key" || !c.key) continue;
    if (opts?.servedProviders?.has(p)) continue;
    return { provider: p, kind: "api_key", key: c.key };
  }
  return null;
}

export function exportCredential(
  provider?: string,
  opts?: { excludeServed?: boolean },
): ExportedCredential | null {
  const scopeKey = currentCredentialScope().key;
  const selected = selectExportCredential(
    readAuthFile(authPathIn(config.dataDir, scopeKey)),
    provider,
    opts?.excludeServed
      ? {
          servedProviders: new Set(
            readServedProvidersAt(
              servedProvidersPathIn(config.dataDir, scopeKey),
            ),
          ),
        }
      : undefined,
  );
  if (
    selected &&
    "kind" in selected &&
    selected.kind === "api_key" &&
    selected.provider === AZURE_OPENAI
  ) {
    const endpoint = azureBaseUrl();
    return endpoint ? { ...selected, enterpriseUrl: endpoint } : selected;
  }
  return selected;
}
