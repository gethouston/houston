import type {
  CustomAuthMode,
  CustomIntegrationDef,
  CustomSpecSource,
} from "./types";

export type AddCustomIntegrationInput =
  | {
      kind: "openapi";
      name: string;
      spec: CustomSpecSource;
      baseUrl?: string;
      website?: string;
      auth: CustomAuthMode;
      slug?: string;
      replace?: boolean;
    }
  | {
      kind: "mcp";
      name: string;
      endpoint: string;
      headers?: Record<string, string>;
      website?: string;
      auth: CustomAuthMode;
      slug?: string;
      replace?: boolean;
    };

export function defFromAddInput(
  input: AddCustomIntegrationInput,
  slug: string,
): CustomIntegrationDef {
  return input.kind === "openapi"
    ? {
        kind: "openapi",
        slug,
        name: input.name,
        spec: input.spec,
        ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
        ...(input.website ? { website: input.website } : {}),
        auth: input.auth,
        addedAtMs: Date.now(),
      }
    : {
        kind: "mcp",
        slug,
        name: input.name,
        endpoint: input.endpoint,
        ...(input.headers ? { headers: input.headers } : {}),
        ...(input.website ? { website: input.website } : {}),
        auth: input.auth,
        addedAtMs: Date.now(),
      };
}
