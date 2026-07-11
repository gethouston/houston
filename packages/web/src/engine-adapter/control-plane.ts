/**
 * Control-plane surface for the web adapter — the barrel over the cohesive
 * modules under `cp/`. In cloud, the web app talks to the Houston control plane
 * (not a single local runtime): agents are REAL and a conversation is proxied to
 * the agent's sandbox, so chat reuses the exact same `HoustonEngineClient` +
 * `streamTurn` path pointed at `${baseUrl}/agents/${agentId}`.
 *
 * This file is the ONE import site every caller and the test suite uses
 * (`import … from "./control-plane"`) — the mixins import it as a namespace and
 * the web tests `vi.mock("…/control-plane")` it — so the split into `cp/*`
 * modules is invisible to consumers. `ControlPlaneConfig` and the shared
 * transport live in `cp/fetch.ts`.
 */

// The type surface callers reference (some as `controlPlane.<Type>`). Re-exported
// once here so importing from the adapter keeps a single import site and the v1
// engine-client agrees.
export type {
  AddOrgMemberResult,
  AgentAccess,
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentMoveStart,
  AgentMoveStatus,
  AgentSettings,
  AuditEntry,
  BillingCheckout,
  BillingSummary,
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  OrgInfo,
  OrgInvite,
  OrgInviteSummary,
  OrgMember,
  OrgRole,
  OrgSettings,
  OrgSummary,
  OrgsList,
  UsageRow,
} from "../../../../ui/engine-client/src/types";

export * from "./cp/agent-color";
export * from "./cp/agent-teams";
export * from "./cp/agents";
export * from "./cp/board";
export * from "./cp/credentials";
export * from "./cp/events";
export * from "./cp/fetch";
export * from "./cp/files-context";
export * from "./cp/integrations";
export * from "./cp/marketplace";
export * from "./cp/orgs";
export * from "./cp/runtime-clients";
export * from "./cp/skills";
export * from "./cp/spaces-billing";
