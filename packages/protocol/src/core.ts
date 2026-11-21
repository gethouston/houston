export const PROTOCOL_VERSION = 3;

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "VERSION_MISMATCH";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  protocol: number;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
  build: string | null;
}

export type OrgRole = "owner" | "admin" | "user";

export type CustomIntegrationScope = "host" | "agent";

export interface Capabilities {
  officePreview?: boolean;
  profile: "local" | "cloud";
  revealInOs: boolean;
  terminal: boolean;
  tunnel: boolean;
  codeExecution: "local-bash" | "remote-sandbox" | "disabled";
  providers: string[];
  openaiCompatible: boolean;
  localModelBridge?: { versions: number[] };
  integrations: string[];
  sharedSkills: boolean;
  agentDelegation?: boolean;
  triggers?: boolean;
  plan?: boolean;
  customIntegrationOAuth?: boolean;
  customIntegrationScope?: CustomIntegrationScope;
  multiplayer?: boolean;
  role?: OrgRole;
  missionTitleOnSend?: boolean;
  conversationPrewarm?: boolean;
  heartbeat?: boolean;
}
