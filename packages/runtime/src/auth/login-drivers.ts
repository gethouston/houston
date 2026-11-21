import type { ProviderAuthInteraction } from "@earendil-works/pi-ai";
import type { LoginInfo } from "@houston/runtime-client";
import type { ProviderId } from "../ai/providers";
import { resetAnthropicCredentialCache } from "../backends/claude/credential-status";
import { resolveClaudeCliBinary } from "./anthropic-cli-binary";
import { runAnthropicLogin } from "./anthropic-cli-login";
import { anthropicSharedLoginDir } from "./anthropic-login-dir";
import { storeAnthropicOauth } from "./anthropic-oauth-store";
import type { LoginState } from "./login-state";
import { authStorage, modelRuntime } from "./storage";
export async function runProviderOAuthLogin(
  provider: ProviderId,
  interaction: ProviderAuthInteraction,
): Promise<void> {
  const oauth = modelRuntime.getProvider(provider)?.auth.oauth;
  if (!oauth) throw new Error(`${provider} has no OAuth sign-in flow`);
  const credential = await oauth.login(interaction);
  await authStorage.modify(provider, async () => credential);
}

export async function runClaudeLogin(
  state: LoginState,
  pastePromise: Promise<string>,
  resolveInfo: (info: LoginInfo) => void,
) {
  const sharedLoginDir = await anthropicSharedLoginDir();
  await runAnthropicLogin(
    {
      onAuth: ({ url, instructions }) => {
        state.info = {
          kind: "auth_code",
          url,
          ...(instructions ? { instructions } : {}),
        };
        state.status = "awaiting_user";
        resolveInfo(state.info);
      },
      onManualCodeInput: () => pastePromise,
    },
    {
      binary: resolveClaudeCliBinary(),
      sharedLoginDir,
      storeToken: (key) =>
        authStorage.set("anthropic", { type: "api_key", key }),
      storeOauth: (cred) => storeAnthropicOauth(cred),
    },
  );
  if (sharedLoginDir) resetAnthropicCredentialCache(true);
}
