import type {
  CustomAuthMode,
  CustomIntegrationDef,
  CustomSpecSource,
} from "./types";

/** What the agent's add tool passes (validated by the sandbox route).
 *  `replace: true` turns a same-slug, same-kind add into an in-place spec
 *  swap that keeps the stored credential — the agent's self-repair path when
 *  a compiled integration turned out to cover fewer actions than the docs. */
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

/** The persisted definition a validated add input becomes. */
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
