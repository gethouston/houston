/**
 * Protocol v3 — the ONE wire contract for the Houston host, every deployment.
 * The frontend talks ONLY to the host (local profile on 127.0.0.1, cloud
 * profile behind the host URL); the host talks to runtimes. The
 * conversation core (conversation.ts) is runtime v2 verbatim, nested under
 * /v1/agents/:id/conversations/* at the host.
 */
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

/**
 * A member's authority inside a multiplayer org. `owner` is the billing/root
 * seat, `admin` manages members + agents, `user` is a plain seat that can only
 * use the agents assigned to them. Absent capability means single-player.
 */
export type OrgRole = "owner" | "admin" | "user";

/**
 * What this host deployment can do. The UI gates affordances on capabilities,
 * NEVER on "am I web / desktop / cloud" branches — that's where drift breeds.
 */
export interface Capabilities {
  /** Deployment profile, for diagnostics only — never branch UI logic on it. */
  profile: "local" | "cloud";
  /** OS file-manager reveal / open (desktop shell present). */
  revealInOs: boolean;
  /** Spawning an OS terminal at a path. */
  terminal: boolean;
  /** Mobile pairing via the reverse tunnel (local profile). */
  tunnel: boolean;
  /**
   * Where agent code runs: in-process bash, the remote sandbox, or nowhere
   * beyond clamped file tools.
   */
  codeExecution: "local-bash" | "remote-sandbox" | "disabled";
  /** Providers this deployment offers for connect-once login. */
  providers: string[];
  /**
   * Whether the user can connect an OpenAI-compatible (local) server — Ollama /
   * vLLM / LM Studio, by base URL + model. LOCAL profile only: the URL is the
   * user's own machine, unreachable from a cloud runtime, so cloud sets false.
   */
  openaiCompatible: boolean;
  /**
   * Third-party integration providers available (e.g. "composio"). Each lets a
   * user connect their OWN account and gives agents tools over those apps.
   * Empty = integrations off for this deployment.
   */
  integrations: string[];
  /**
   * Whether this deployment runs in multiplayer (paid org) mode: members,
   * roles, per-agent assignment. Absent/false = single personal workspace.
   * Optional so every existing single-player host/profile stays valid.
   */
  multiplayer?: boolean;
  /**
   * The current user's role in the org, when `multiplayer` is on. Drives which
   * management affordances the UI shows. Absent in single-player mode.
   */
  role?: OrgRole;
}
