import type en from "../../locales/en/integrations.json";

export interface CuratedIntegration {
  slug: string;
  name: string;
  source: CuratedSource;
  website: string;
  categories: readonly string[];
  authModes: readonly CuratedAuthMode[];
  signUpUrl: string;
  apiKeysUrl: string;
  descriptionKey: CuratedCopyKey<"description">;
  keyHelpKey?: CuratedCopyKey<"keyHelp">;
  keyTitleKey?: CuratedCopyKey<"keyTitle">;
  keyDescKey?: CuratedCopyKey<"keyDesc">;
  extraHeader?: {
    name: string;
    labelKey: CuratedCopyKey<"headerLabel">;
    helpKey: CuratedCopyKey<"headerHelp">;
  };
  signInTitleKey?: CuratedCopyKey<"signInTitle">;
  signInDescKey?: CuratedCopyKey<"signInDesc">;
  providerTitleKey?: CuratedCopyKey<"providerTitle">;
  providerDescKey?: CuratedCopyKey<"providerDesc">;
}

export type CuratedAuthMode = "oauth" | "credential";

export type CuratedSource =
  | {
      kind: "mcp";
      endpoint: string;
    }
  | {
      kind: "openapi";
      spec: string;
      baseUrl: string;
    };

type CuratedCopy = (typeof en)["curated"];
export type CuratedCopyKey<Leaf extends string> = {
  [Slug in keyof CuratedCopy & string]: Leaf extends keyof CuratedCopy[Slug]
    ? `curated.${Slug}.${Leaf}`
    : never;
}[keyof CuratedCopy & string];
