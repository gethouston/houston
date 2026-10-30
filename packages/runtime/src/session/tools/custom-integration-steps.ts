/**
 * The custom-integration setup procedure, delivered in the tool results of
 * the setup itself instead of the always-sent product prompt: it costs
 * nothing on the turns that never set one up, and arrives exactly when the
 * agent is doing it. The prompt keeps only the research order that comes
 * before `custom_integration_detect`.
 */

/** Appended to every `custom_integration_detect` result. */
export const SETUP_STEPS =
  "How to finish the setup: (1) When the service has its own sign-in MCP server and sign-in is supported here, offer that to the user first: it is easier and safer than finding an API key. (2) When the service publishes an OpenAPI document, pass its URL as `url` to custom_integration_add; never retype or trim it. When it publishes none, write a complete OpenAPI 3 document from its documentation covering EVERY operation it describes (servers, operationIds, the auth scheme), not just what today's task needs, check locally that it is well-formed and its refs resolve, and pass it as `spec`. (3) Add the integration ONCE, with a name the user will recognize: never add a probe or test integration, and fix a wrong spec with `replace: true` instead of a second integration. If the user switches how a service connects (an API key to sign-in, or the reverse), add the new version and remove the unfinished old one with custom_integration_remove: one integration per service. (4) A key-based or sign-in service then needs request_credential in the same turn; never ask for a key, token, or password in the chat, and never repeat one back.";

/** Appended to an ACTIVE `custom_integration_add` result. */
export const COVERAGE_CHECK =
  "Check this count against the operations the documentation describes. If it is lower, the spec is wrong: fix it with `replace: true` before telling the user it is ready, and never present a partial integration as done.";

/**
 * The closing step, appended to the results that end the setup (an active
 * add, a queued credential card): it must survive into the turn that starts
 * when the user's key arrives.
 */
export const VERIFY_STEP =
  "Before telling the user it works, verify it with one harmless read-only action (find one with integration_search, run it with integration_execute: list items, fetch the profile, read one record; never anything that creates, changes, or deletes). If that fails with an authentication error, the key is likely wrong: call request_credential again. Only skip the check when the service has no read-only action, and say so honestly.";
