import type { ObjectStore } from "@houston/runtime-client/object-sync";
import {
  fireTurn,
  PREFIXES,
  storedConversationText,
  TOKENS,
} from "./claim-path-support";
import type { SeenToken } from "./echo-provider";

export async function probeAuthFailureLeak(opts: {
  baseUrl: string;
  seenTokens: SeenToken[];
}): Promise<string> {
  const health = await import("../src/auth/credential-health");
  health.resetAuthFailures();
  await fireTurn({
    baseUrl: opts.baseUrl,
    prefix: PREFIXES.materialized.A,
    agent: "A",
    conversationId: "auth-failure-a",
    text: "AUTH-FAILURE-A",
    token: "sk-agent-a-bad",
    seenTokens: opts.seenTokens,
  });
  const marked = health.authFailureActive("openai-compatible");
  await fireTurn({
    baseUrl: opts.baseUrl,
    prefix: PREFIXES.materialized.B,
    agent: "B",
    conversationId: "auth-heal-b",
    text: "AUTH-HEAL-B",
    token: TOKENS.B,
    seenTokens: opts.seenTokens,
  });
  const survived = health.authFailureActive("openai-compatible");
  health.resetAuthFailures();
  return marked && !survived ? "LEAK CONFIRMED" : "NOT OBSERVED";
}

export async function checkStoredIsolation(
  store: ObjectStore,
  scratch: string,
): Promise<{ isolated: boolean; noAuth: boolean }> {
  let isolated = true;
  let noAuth = true;
  for (const variant of ["materialized", "empty"] as const) {
    const a = await storedConversationText(store, scratch, PREFIXES[variant].A);
    const b = await storedConversationText(store, scratch, PREFIXES[variant].B);
    isolated &&=
      !a.includes("SECRET-B") &&
      !a.includes("REQUEST-B") &&
      !b.includes("SECRET-A") &&
      !b.includes("REQUEST-A");
    for (const prefix of Object.values(PREFIXES[variant])) {
      noAuth &&= !(await store.list(prefix)).some((key) =>
        key.endsWith("auth.json"),
      );
    }
  }
  return { isolated, noAuth };
}
