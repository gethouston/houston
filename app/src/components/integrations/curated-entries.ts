import type { CuratedIntegration } from "./curated-entry.ts";
import manychatOpenApi from "./manychat-openapi.json" with { type: "json" };

const CROMA: CuratedIntegration = {
  slug: "croma",
  name: "Croma",
  source: { kind: "mcp", endpoint: "https://api.croma.run/mcp" },
  website: "https://usecroma.com",
  categories: ["legal"],
  authModes: ["oauth", "credential"],
  signUpUrl: "https://platform.usecroma.com/sign-up",
  apiKeysUrl: "https://platform.usecroma.com",
  descriptionKey: "curated.croma.description",
  keyHelpKey: "curated.croma.keyHelp",
};

/**
 * HighLevel (GoHighLevel) through its official MCP server, paired with
 * Composio's `highlevel` app on deployments that have it. Token only, as
 * HighLevel's help center documents: a Private Integration Token created in
 * the sub-account, plus that sub-account's id as the `locationId` header
 * on every call. The server also advertises OAuth (the marketplace docs
 * even recommend it), but its consent page refuses eight of the scopes its
 * own app requests and the flow dies there — not offered until HighLevel
 * fixes it. Trailing slash on the endpoint matters: it is the resource the
 * server names.
 */
const HIGHLEVEL: CuratedIntegration = {
  slug: "highlevel",
  name: "HighLevel",
  source: {
    kind: "mcp",
    endpoint: "https://services.leadconnectorhq.com/mcp/",
  },
  website: "https://www.gohighlevel.com",
  categories: ["crm", "marketing"],
  authModes: ["credential"],
  signUpUrl: "https://www.gohighlevel.com/signup",
  apiKeysUrl: "https://app.gohighlevel.com",
  descriptionKey: "curated.highlevel.description",
  keyHelpKey: "curated.highlevel.keyHelp",
  keyTitleKey: "curated.highlevel.keyTitle",
  keyDescKey: "curated.highlevel.keyDesc",
  extraHeader: {
    name: "locationId",
    labelKey: "curated.highlevel.headerLabel",
    helpKey: "curated.highlevel.headerHelp",
  },
  providerTitleKey: "curated.highlevel.providerTitle",
  providerDescKey: "curated.highlevel.providerDesc",
};

/**
 * ManyChat over its public Page API, from a committed OpenAPI document
 * (`scripts/gen-manychat-openapi.mjs` bakes it from ManyChat's published
 * spec). Composio does list a `many_chat` toolkit, but it has carried zero
 * actions at every version, so it never reaches the catalog; and ManyChat's
 * own spec names operations by MD5 hash with no summary, which is why the
 * document is committed rather than fetched. Auth is the account's API key
 * as a bearer token (`<account id>:<secret>`), a Pro-plan feature.
 */
const MANYCHAT: CuratedIntegration = {
  slug: "manychat",
  name: "ManyChat",
  source: {
    kind: "openapi",
    spec: JSON.stringify(manychatOpenApi),
    baseUrl: "https://api.manychat.com",
  },
  website: "https://manychat.com",
  categories: ["marketing-automation", "ai-chatbots"],
  authModes: ["credential"],
  signUpUrl: "https://app.manychat.com/signup",
  apiKeysUrl: "https://app.manychat.com",
  descriptionKey: "curated.manychat.description",
  keyHelpKey: "curated.manychat.keyHelp",
  keyTitleKey: "curated.manychat.keyTitle",
  keyDescKey: "curated.manychat.keyDesc",
};

export const CURATED_INTEGRATIONS: readonly CuratedIntegration[] = [
  CROMA,
  HIGHLEVEL,
  MANYCHAT,
];
