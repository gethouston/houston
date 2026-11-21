import { PROVIDER_ACCOUNT_BLOCKED_CODE } from "./account-blocked";

export class RemoteCredentialBlockedError extends Error {
  constructor(
    readonly provider: string,
    readonly detail: string,
  ) {
    super(`credential gateway GET ${provider} reported a blocked account`);
    this.name = "RemoteCredentialBlockedError";
  }
}

export function gatewayBlockedDetail(text: string): string | null {
  try {
    const body = JSON.parse(text) as { code?: unknown; detail?: unknown };
    if (body.code !== PROVIDER_ACCOUNT_BLOCKED_CODE) return null;
    return typeof body.detail === "string" ? body.detail : "";
  } catch {
    return null;
  }
}
