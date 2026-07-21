/**
 * @houston/agentstore-client — the single, isomorphic HTTP client for the
 * Houston gateway's Agent Store REST API (`/v1/agentstore`). It carries the
 * unified wire types (reconciled against the authoritative Go handlers), the one
 * {@link StoreApiError} class every consumer branches on, and the
 * {@link AgentStoreClient} that all three consumers (the Next.js catalog, the
 * desktop/web engine client, and the publish adapter) call through. No
 * environment reads, no `window`/Node built-ins — consumer-specific origin and
 * caching are injected per call.
 */

export type { StoreClientOptions, StoreRequestOptions } from "./client.ts";
export { AgentStoreClient, STORE_API_PREFIX } from "./client.ts";
export { StoreApiError } from "./errors.ts";
export type {
  AdminQueueItem,
  AdminReport,
  AgentIdentityPatch,
  AgentPatch,
  AgentState,
  AgentVisibility,
  AvatarUploadResult,
  ClaimInput,
  ClaimResult,
  CreateAgentRequest,
  CreateAgentResponse,
  CreatorAnalytics,
  CreatorInstallRow,
  CreatorLinks,
  CreatorProfile,
  CreatorProfilePatch,
  CreatorReport,
  HandleAvailability,
  HandleUnavailableReason,
  MyAgent,
  PatchAgentResponse,
  PurgeResult,
  ReportInput,
  ReportReason,
  ReportStatus,
  StoreAgentDetail,
  StoreAgentSummary,
  StoreCatalogPage,
  StoreCatalogQuery,
  StoreCatalogSort,
  StoreCategory,
  StoreCreator,
  StoreCreatorPage,
  StoreIcon,
  StoreInstallTarget,
} from "./types.ts";
