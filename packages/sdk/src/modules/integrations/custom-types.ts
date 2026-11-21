export interface CustomAuthField {
  variable: string;
  label: string;
}

export interface CustomAuthMethod {
  template: string;
  label: string;
  fields: CustomAuthField[];
}

export type CustomIntegrationState =
  | { status: "active"; toolCount: number }
  | { status: "pending"; authMethods: CustomAuthMethod[] }
  | { status: "error"; message: string };

export interface CustomToolInfo {
  name: string;
  description?: string;
}

export interface CustomDetectResult {
  kind: "openapi" | "mcp" | "unknown";
  name?: string;
  suggestedSlug?: string;
  requiresAuthentication?: boolean;
  requiresOAuth?: boolean;
  oauthSupported?: boolean;
  toolCount?: number;
}

export type AddCustomIntegrationInput =
  | {
      kind: "openapi";
      name: string;
      url?: string;
      spec?: string;
      baseUrl?: string;
      website?: string;
      auth: "none" | "credential";
      slug?: string;
      replace?: boolean;
    }
  | {
      kind: "mcp";
      name: string;
      endpoint: string;
      website?: string;
      headers?: Record<string, string>;
      auth: "none" | "credential" | "oauth";
      slug?: string;
      replace?: boolean;
    };

export interface CustomIntegrationView {
  slug: string;
  name: string;
  website?: string;
  kind: "openapi" | "mcp";
  auth?: "none" | "credential" | "oauth";
  displayUrl?: string;
  iconUrl?: string;
  addedAtMs: number;
  state: CustomIntegrationState;
  authMethods?: CustomAuthMethod[];
  verified?: boolean;
}

export interface CustomIntegrationDetails {
  name: string;
  website: string;
}
