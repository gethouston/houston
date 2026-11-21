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
