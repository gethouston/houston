export type CustomSpecSource =
  | { kind: "url"; url: string }
  | { kind: "blob"; value: string };

export interface CustomCredentialRef {
  template: string;
  secretIds: Record<string, string>;
}

export type CustomAuthMode = "none" | "credential" | "oauth";

export type CustomIntegrationDef =
  | {
      kind: "openapi";
      slug: string;
      name: string;
      spec: CustomSpecSource;
      baseUrl?: string;
      website?: string;
      auth: CustomAuthMode;
      addedAtMs: number;
      credential?: CustomCredentialRef;
    }
  | {
      kind: "mcp";
      slug: string;
      name: string;
      endpoint: string;
      headers?: Record<string, string>;
      website?: string;
      auth: CustomAuthMode;
      addedAtMs: number;
      credential?: CustomCredentialRef;
    };

export const CUSTOM_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

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

export interface CustomIntegrationView {
  slug: string;
  name: string;
  website?: string;
  kind: CustomIntegrationDef["kind"];
  auth: CustomAuthMode;
  displayUrl?: string;
  iconUrl?: string;
  addedAtMs: number;
  state: CustomIntegrationState;
  authMethods?: CustomAuthMethod[];
  verified?: boolean;
}

export class CustomIntegrationError extends Error {
  constructor(
    readonly code:
      | "invalid_slug"
      | "invalid_details"
      | "duplicate_slug"
      | "not_found"
      | "unsupported_source"
      | "credential_invalid"
      | "compile_failed"
      | "oauth_unsupported"
      | "oauth_failed"
      | "oauth_state_invalid",
    message: string,
  ) {
    super(message);
    this.name = "CustomIntegrationError";
  }
}
