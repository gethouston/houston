import {
  clearCustomEndpointConfig,
  OPENAI_COMPATIBLE,
} from "../ai/openai-compatible";
import { piProviderIds } from "../ai/pi-catalog";
import {
  activeProvider,
  isProvider,
  PROVIDERS,
  type ProviderId,
} from "../ai/providers";
import {
  logoutAnthropicCredential,
  refreshAnthropicCredential,
} from "../backends/claude/credential-status";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../session/acting-context";
import { active, activeKey, clearLoginExpiry } from "./login-state";
import { authStorage, providerConnected } from "./storage";

export {
  autoPromptAnswer,
  codexLoginMethod,
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "./login-policy";
export { startLogin } from "./login-start";
export {
  COPILOT_NO_ACCESS_ERROR,
  getLoginStatus,
  LOGIN_TIMEOUT_ERROR,
  LOGIN_TIMEOUT_MS,
  loginFailureMessage,
} from "./login-state";

const known = (id: string): id is ProviderId => isProvider(id);
function authStatusRow(id: ProviderId, name: string) {
  const st = active.get(activeKey(id));
  const cred = authStorage.get(id) as { enterpriseUrl?: string } | undefined;
  return {
    provider: id,
    name,
    configured: providerConnected(authStorage, id),
    enterpriseUrl: cred?.enterpriseUrl ?? null,
    login: st ? { status: st.status, info: st.info, error: st.error } : null,
  };
}

export async function getAuthStatus() {
  await refreshAnthropicCredential();
  const providers = PROVIDERS.map((p) => authStatusRow(p.id, p.name));
  const curated = new Set(PROVIDERS.map((p) => p.id));
  for (const id of piProviderIds()) {
    if (!curated.has(id) && providerConnected(authStorage, id))
      providers.push(authStatusRow(id, id));
  }
  return { providers, activeProvider: activeProvider() };
}

export {
  assertApiKeyConnectable,
  LOCAL_PLACEHOLDER_KEY,
  setApiKey,
  setCustomEndpoint,
} from "./login-keys";

export function loginPending(): boolean {
  for (const state of active.values()) {
    if (state.status === "starting" || state.status === "awaiting_user")
      return true;
  }
  return false;
}

// WHY: Abort stops device-code pollers; rejecting the paste closes loopback servers; do both. ADR-0008
export function cancelLogin(providerId: string): void {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  const key = activeKey(providerId);
  const state = active.get(key);
  if (!state || state.status === "complete") return;
  active.delete(key);
  clearLoginExpiry(state);
  state.abort?.abort();
  state.rejectPaste?.(new Error("login cancelled"));
}

export function completeLogin(providerId: string, code: string): void {
  const state = active.get(activeKey(providerId as ProviderId));
  if (!state?.resolvePaste)
    throw new Error(`no active login for ${providerId}`);
  state.resolvePaste(code);
}

export async function logout(providerId: string): Promise<void> {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  await authStorage.delete(providerId);
  const key = activeKey(providerId);
  const state = active.get(key);
  if (state) clearLoginExpiry(state);
  active.delete(key);
  if (providerId === "anthropic") {
    if (isPersonalScope(currentCredentialScope().key))
      console.log(
        "[oauth:anthropic] personal disconnect: leaving the pod-shared Claude login dir (team credential) in place",
      );
    else await logoutAnthropicCredential();
  }
  if (providerId === OPENAI_COMPATIBLE) clearCustomEndpointConfig();
}
