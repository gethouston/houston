import { accessDigest } from "@houston/protocol/access-digest";
import { ANTHROPIC_TOKEN_PREFIXES } from "../../auth/anthropic-setup-token";
import type { HoustonAuthStore } from "../../auth/credential-store";
import type { ClaudeToken } from "./backend";
import {
  anthropicIsCentrallyServed,
  readSharedLogin,
  type StoredLogin,
  sharedLoginSupersedes,
} from "./shared-login";

const [OAUTH_TOKEN_PREFIX, API_KEY_PREFIX] = ANTHROPIC_TOKEN_PREFIXES;

function classify(value: string): ClaudeToken | undefined {
  if (value.startsWith(OAUTH_TOKEN_PREFIX))
    return { kind: "oauth-token", value };
  if (value.startsWith(API_KEY_PREFIX)) return { kind: "api-key", value };
  console.warn(
    `[claude] stored "anthropic" token has an unrecognized prefix (expected ${OAUTH_TOKEN_PREFIX}… or ${API_KEY_PREFIX}…); refusing to use it`,
  );
  return undefined;
}

export function readAnthropicToken(
  store: Pick<HoustonAuthStore, "get"> &
    Partial<Pick<HoustonAuthStore, "remove">>,
): ClaudeToken | undefined {
  const stored = readStoredAnthropicToken(store);
  if (stored === "expired" && anthropicIsCentrallyServed()) {
    console.warn(
      '[claude] the served "anthropic" access token is expired; refusing the shared login dir, which is not this runtime\'s authority',
    );
    return undefined;
  }
  const shared = readSharedLogin();
  if (!stored || stored === "expired") return shared?.token;
  if (
    shared &&
    stored.supersedable &&
    sharedLoginSupersedes(shared, stored.supersedable)
  ) {
    try {
      store.remove?.("anthropic");
    } catch (err) {
      console.error(
        '[claude] could not drop the superseded "anthropic" credential; the shared login is used for this turn and the drop is retried on the next read:',
        err instanceof Error ? err.message : String(err),
      );
    }
    return shared.token;
  }
  return stored.token;
}

function readStoredAnthropicToken(
  store: Pick<HoustonAuthStore, "get">,
):
  | { token: ClaudeToken; supersedable: StoredLogin | null }
  | "expired"
  | undefined {
  const cred = store.get("anthropic");
  if (!cred) return undefined;

  if (cred.type === "api_key") {
    const key = cred.key?.trim();
    if (!key) {
      console.warn(
        `[claude] stored "anthropic" api_key credential has no key; refusing to use it`,
      );
      return undefined;
    }
    const token = classify(key);
    return token ? { token, supersedable: null } : undefined;
  }
  if (cred.type === "oauth") {
    const access = cred.access?.trim();
    if (!access) {
      console.warn(
        `[claude] stored "anthropic" oauth credential has an empty access token; ignoring it`,
      );
      return undefined;
    }
    if (cred.expires > 0 && cred.expires <= Date.now()) {
      console.warn(
        `[claude] stored "anthropic" oauth access token is expired; falling back to the shared login dir credential`,
      );
      return "expired";
    }
    const token = classify(access);
    if (!token) return undefined;
    return {
      token: { ...token, accessDigest: accessDigest(access) },
      supersedable: { value: access, expires: cred.expires },
    };
  }

  console.warn(
    `[claude] stored "anthropic" credential is a "${(cred as { type: string }).type}" entry, expected api_key or oauth; ignoring it`,
  );
  return undefined;
}
