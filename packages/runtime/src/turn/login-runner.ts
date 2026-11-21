import type { LoginInfo } from "@houston/runtime-client";
import type { ExportedCredential } from "../auth/export";
import { wireErrorMessage } from "./server-http";

export interface CaptureCredential {
  kind: "oauth" | "api_key";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
}

export function captureWire(credential: ExportedCredential): CaptureCredential {
  if ("kind" in credential) {
    return {
      kind: "api_key",
      access: credential.key,
      refresh: "",
      expires: 0,
      ...(credential.enterpriseUrl !== undefined
        ? { enterpriseUrl: credential.enterpriseUrl }
        : {}),
    };
  }
  return {
    kind: "oauth",
    access: credential.access,
    refresh: credential.refresh,
    expires: credential.expires,
    ...(credential.accountId !== undefined
      ? { accountId: credential.accountId }
      : {}),
    ...(credential.enterpriseUrl !== undefined
      ? { enterpriseUrl: credential.enterpriseUrl }
      : {}),
  };
}

export interface LoginRunner {
  start(
    provider: string,
    deviceAuth?: boolean,
    enterpriseDomain?: string,
  ): Promise<LoginInfo>;
  status(provider: string): {
    status: "starting" | "awaiting_user" | "complete" | "error";
    info?: LoginInfo;
    error?: string;
  } | null;
  complete(provider: string, code: string): void;
  cancel(provider: string): void;
  credential(provider: string): CaptureCredential | null;
  apiKey(
    provider: string,
    key: string,
    endpoint?: string,
  ): Promise<CaptureCredential>;
  failure(
    provider: string,
    error: unknown,
  ): { error: string; kind?: string; reason?: string };
}

export async function loadLoginRunner(): Promise<LoginRunner> {
  const [login, exported, verify, azure] = await Promise.all([
    import("../auth/login"),
    import("../auth/export"),
    import("../auth/verify-api-key"),
    import("../ai/azure-openai"),
  ]);
  return {
    start: login.startLogin,
    status: login.getLoginStatus,
    complete: login.completeLogin,
    cancel: login.cancelLogin,
    credential: (provider) => {
      const credential = exported.exportCredential(provider);
      return credential ? captureWire(credential) : null;
    },
    apiKey: async (provider, apiKey, endpoint) => {
      const access = login.assertApiKeyConnectable(provider, apiKey, endpoint);
      const enterpriseUrl =
        provider === azure.AZURE_OPENAI
          ? azure.normalizeAzureEndpoint(endpoint ?? "")
          : undefined;
      await verify.verifyApiKey(
        provider,
        access,
        enterpriseUrl ? { azureBaseUrl: enterpriseUrl } : {},
      );
      return {
        kind: "api_key",
        access,
        refresh: "",
        expires: 0,
        ...(enterpriseUrl ? { enterpriseUrl } : {}),
      };
    },
    failure: (provider, error) => ({
      error: login.loginFailureMessage(provider, wireErrorMessage(error)),
      ...(error &&
      typeof error === "object" &&
      "kind" in error &&
      typeof error.kind === "string"
        ? { kind: error.kind }
        : {}),
      ...(error instanceof verify.ApiKeyVerifyError
        ? { reason: error.reason }
        : {}),
    }),
  };
}
