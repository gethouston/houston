/**
 * The wire types for the Houston gateway's Agent Store REST API
 * (`/v1/agentstore/*`). These are reconciled against the authoritative Go
 * handlers (`cloud/internal/edge/agentstoreroutes` + `cloud/internal/agentstore`)
 * and unify the previously divergent shapes carried by the Next.js frontend
 * (`agentstore/src/lib/*`) and the desktop/web engine client
 * (`ui/engine-client/src/*`). Pure types only — this module is isomorphic and
 * reads no environment.
 */
import type { AgentIR } from "@houston/agentstore-contract";

/** The gateway's icon shape: an emoji or an https URL, both under `value`. */
export interface StoreIcon {
  kind: "emoji" | "url";
  value: string;
}

/**
 * Who is credited on a listing. `handle`/`avatarUrl`/`verified` are populated
 * from the creator's profile when one exists (the gateway sets `verified`
 * whenever a profile is present); they are absent on unclaimed/legacy listings.
 */
export interface StoreCreator {
  displayName: string;
  url?: string;
  handle?: string;
  avatarUrl?: string;
  verified?: boolean;
}

/**
 * A creator's optional social/web links. Every value is an https URL; an absent
 * link is an absent key (mirrors the Go `SocialLinks` with `omitempty`).
 */
export interface CreatorLinks {
  x?: string;
  youtube?: string;
  tiktok?: string;
  instagram?: string;
  github?: string;
  linkedin?: string;
  website?: string;
}

/**
 * The wire-ready creator profile (`GET /creators/{handle}`, `GET /me/profile`).
 * `handle` is null while unclaimed; `bio`/`avatarUrl` are null when unset.
 */
export interface CreatorProfile {
  handle: string | null;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean;
  links: CreatorLinks;
  createdAt: string;
  updatedAt: string;
}

/**
 * The partial edit behind `PATCH /me/profile`: an absent field is left
 * untouched. `verified` is never settable here (admin-only). The first
 * materializing patch requires `handle` + `displayName`.
 */
export interface CreatorProfilePatch {
  handle?: string;
  displayName?: string;
  bio?: string;
  links?: CreatorLinks;
}

/** Why a handle is unavailable (`GET /handles/{handle}/available`). */
export type HandleUnavailableReason = "taken" | "reserved" | "invalid";

/** The result of a handle-availability check; `reason` is set only when taken. */
export interface HandleAvailability {
  available: boolean;
  reason?: HandleUnavailableReason;
}

/**
 * A creator's public page (`GET /creators/{handle}`): the profile plus one page
 * of their public, published agents.
 */
export interface StoreCreatorPage {
  profile: CreatorProfile;
  agents: StoreCatalogPage;
}

/** The result of an avatar upload (`POST /me/avatar`). */
export interface AvatarUploadResult {
  avatarUrl: string;
}

/** One (agent, UTC day) install bucket in the creator analytics response. */
export interface CreatorInstallRow {
  agentId: string;
  slug: string | null;
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  installs: number;
}

/** The creator install analytics (`GET /me/analytics`): per-day rows + totals. */
export interface CreatorAnalytics {
  rows: CreatorInstallRow[];
  totals: { installs: number };
}

/**
 * A listing's lifecycle state (the Go `agentstore.State*` closed set). Owners
 * move `draft → published`; the gateway retires to `archived`.
 */
export type AgentState = "draft" | "published" | "archived";

/**
 * A listing's visibility (the Go `agentstore.Visibility*` closed set). Owners
 * may only set `unlisted`; `public` is reached solely through admin approval.
 */
export type AgentVisibility = "unlisted" | "public";

/**
 * The denormalized agent projection returned by every list/detail/owner/queue
 * endpoint (the Go `agentstore.AgentSummary`). `state`/`visibility` are always
 * present on the wire but marked optional here so browse-only consumers that
 * ignore them stay decoupled from the owner surface.
 */
export interface StoreAgentSummary {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  description: string;
  icon: StoreIcon | null;
  color: string | null;
  category: string;
  tags: string[];
  integrations: string[];
  creator: StoreCreator;
  installsCount: number;
  publishedAt: string | null;
  updatedAt: string;
  state?: AgentState;
  visibility?: AgentVisibility;
}

/** One page of the public catalog (server page size is fixed at 24). */
export interface StoreCatalogPage {
  items: StoreAgentSummary[];
  hasMore: boolean;
}

/** Catalog sort modes; anything but `installs` is the recent default. */
export type StoreCatalogSort = "recent" | "installs";

/** Query parameters accepted by `GET /agents`. */
export interface StoreCatalogQuery {
  /** Full-text search (websearch syntax). */
  q?: string;
  /** A store category slug; omit for all categories. */
  category?: string;
  /** An UPPERCASE Composio toolkit slug the agent must declare. */
  integration?: string;
  sort?: StoreCatalogSort;
  /** 1-based page number. */
  page?: number;
  /** A creator @handle to scope the catalog to that creator's public agents. */
  creator?: string;
}

/** A single agent page: its summary plus the full published-version IR. */
export interface StoreAgentDetail {
  agent: StoreAgentSummary;
  ir: AgentIR;
}

/** One entry of the controlled category vocabulary (`GET /categories`). */
export interface StoreCategory {
  slug: string;
  name: string;
}

/** The install targets the gateway counts (`POST /agents/{slug}/installs`). */
export type StoreInstallTarget = "houston" | "claude_skill_zip" | "copy_paste";

/** The moderation reasons accepted by `POST /agents/{slug}/reports`. */
export type ReportReason =
  | "spam"
  | "malicious"
  | "impersonation"
  | "inappropriate"
  | "other";

/** An anonymous abuse report body. `details`/`contact` are optional free text. */
export interface ReportInput {
  reason: ReportReason;
  details?: string;
  contact?: string;
}

/** The body of `POST /claim`. */
export interface ClaimInput {
  agentId: string;
  code: string;
}

/** The result of claiming an unclaimed agent (`POST /claim`). */
export interface ClaimResult {
  agentId: string;
  /** Set when the claimed agent already carries a published slug. */
  slug?: string;
}

/**
 * One of the caller's agents (`GET /me/agents`). The gateway returns the same
 * `AgentSummary` projection here as the catalog, in every lifecycle state, so
 * `state`/`visibility` are populated on this surface.
 */
export type MyAgent = StoreAgentSummary;

/** The editable identity fields on a `PATCH … {identity}` call. */
export interface AgentIdentityPatch {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  creator?: StoreCreator;
}

/**
 * The mutations `PATCH /agents/{id}` accepts. The gateway applies every present
 * intent in a fixed order, but callers send exactly one per call. `ir` replaces
 * the stored IR (re-validated + secret-scanned server-side).
 */
export type AgentPatch =
  | { identity: AgentIdentityPatch }
  | { ir: AgentIR }
  | { publish: true }
  | { unpublish: true }
  | { visibility: "unlisted" }
  | { requestPublic: true };

/** The response of a successful `PATCH /agents/{id}`. */
export interface PatchAgentResponse {
  agent: StoreAgentSummary;
}

/**
 * The body of the authenticated (owned) `POST /agents` publish call. `publish`
 * finalizes a share slug and marks the new agent published.
 */
export interface CreateAgentRequest {
  ir: AgentIR;
  publish?: boolean;
}

/**
 * The response of the authenticated `POST /agents`. `slug`/`shareUrl` are set
 * only when `publish` finalized a share slug.
 */
export interface CreateAgentResponse {
  agentId: string;
  slug?: string;
  shareUrl?: string;
}

/**
 * An agent awaiting a public-visibility decision (`GET /admin/queue`). The
 * gateway emits the same `AgentSummary` projection as every other listing.
 */
export type AdminQueueItem = StoreAgentSummary;

/** Status of a moderation report. */
export type ReportStatus = "open" | "resolved" | "dismissed";

/**
 * One abuse report in the moderation console (`GET /admin/reports`). The gateway
 * emits a flat shape: the reported agent is referenced by `agentId`/`agentSlug`,
 * with no denormalized name and no `resolvedAt`.
 */
export interface AdminReport {
  id: string;
  agentId: string;
  agentSlug: string | null;
  reason: ReportReason;
  details: string | null;
  contact: string | null;
  status: ReportStatus;
  createdAt: string;
}

/**
 * One creator abuse report in the moderation console
 * (`GET /admin/creator-reports`). Unlike {@link AdminReport}, the reported
 * subject is a creator profile, referenced by `profileUserId` and its current
 * `handle` (null after an admin release). There is no `agentId`/`agentSlug`.
 */
export interface CreatorReport {
  id: string;
  profileUserId: string;
  handle: string | null;
  reason: ReportReason;
  details: string | null;
  contact: string | null;
  status: ReportStatus;
  createdAt: string;
}

/** Result of the retention purge (`POST /admin/purge`). */
export interface PurgeResult {
  draftsDeleted: number;
  softDeletedPurged: number;
}
