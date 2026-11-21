import { githubCopilotProvider } from "@earendil-works/pi-ai/providers/github-copilot";
import { isApiKeyCredential, type WorkspaceCredential } from "../ports";
import {
  accountBlockedDetail,
  mintFailureStatus,
  ProviderAccountBlockedError,
} from "./account-blocked";
import {
  exchangeRefreshToken,
  REFRESH_TIMEOUT_MS,
  TransientRefreshError,
} from "./oauth-token-exchange";

const copilotOAuth = githubCopilotProvider().auth.oauth;

const OAUTH: Record<string, { tokenUrl: string; clientId: string }> = {
  "openai-codex": {
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  },
};

export interface RefreshOptions {
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const backoffMs = (): number => 250 + Math.floor(Math.random() * 250);

export function isExpiring(
  cred: WorkspaceCredential,
  skewMs = 120_000,
): boolean {
  if (isApiKeyCredential(cred)) return false;
  return Date.now() >= cred.expiresAt - skewMs;
}

export async function refreshCredential(
  cred: WorkspaceCredential,
  opts: RefreshOptions = {},
): Promise<WorkspaceCredential> {
  if (isApiKeyCredential(cred)) return cred;

  if (cred.provider === "github-copilot") {
    if (!copilotOAuth)
      throw new Error("pi-ai github-copilot provider exposes no OAuth flow");
    let r: Awaited<ReturnType<typeof copilotOAuth.refresh>>;
    try {
      r = await copilotOAuth.refresh(
        {
          type: "oauth",
          access: cred.accessToken,
          refresh: cred.refreshToken,
          expires: cred.expiresAt,
          ...(cred.enterpriseUrl ? { enterpriseUrl: cred.enterpriseUrl } : {}),
        },
        AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      );
    } catch (err) {
      const detail =
        err instanceof Error
          ? accountBlockedDetail(
              mintFailureStatus(err.message) ?? 0,
              err.message,
            )
          : null;
      if (detail !== null)
        throw new ProviderAccountBlockedError(cred.provider, detail);
      throw err;
    }
    return {
      workspaceId: cred.workspaceId,
      provider: cred.provider,
      accessToken: r.access,
      refreshToken: r.refresh,
      accountId: cred.accountId,
      expiresAt: r.expires,
      enterpriseUrl: cred.enterpriseUrl,
    };
  }

  const cfg = OAUTH[cred.provider];
  if (!cfg)
    throw new Error(`no OAuth refresh config for provider ${cred.provider}`);

  const attempts = Math.max(1, opts.attempts ?? 2);
  const sleep = opts.sleep ?? realSleep;
  let transient: TransientRefreshError | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoffMs());
    try {
      return await exchangeRefreshToken(cfg, cred);
    } catch (err) {
      if (!(err instanceof TransientRefreshError)) throw err;
      transient = err;
    }
  }
  throw transient ?? new Error(`OAuth refresh failed for ${cred.provider}`);
}
