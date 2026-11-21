import type { AgentIR } from "@houston/agentstore-contract";

export interface StoreIcon {
  kind: "emoji" | "url";
  value: string;
}

export interface StoreCreator {
  displayName: string;
  url?: string;
  handle?: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface CreatorLinks {
  x?: string;
  youtube?: string;
  tiktok?: string;
  instagram?: string;
  github?: string;
  linkedin?: string;
  website?: string;
}

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

export interface CreatorProfilePatch {
  handle?: string;
  displayName?: string;
  bio?: string;
  links?: CreatorLinks;
}

export type HandleUnavailableReason = "taken" | "reserved" | "invalid";

export interface HandleAvailability {
  available: boolean;
  reason?: HandleUnavailableReason;
}

export interface StoreCreatorPage {
  profile: CreatorProfile;
  agents: StoreCatalogPage;
}

export interface CreatorDirectoryEntry {
  handle: string;
  displayName: string;
  avatarUrl?: string;
  verified: boolean;
  bio?: string;
  agentsCount: number;
  installsCount: number;
}

export interface CreatorDirectoryPage {
  items: CreatorDirectoryEntry[];
  hasMore: boolean;
}

export interface AvatarUploadResult {
  avatarUrl: string;
}

export interface CreatorInstallRow {
  agentId: string;
  slug: string | null;
  day: string;
  installs: number;
}

export interface CreatorAnalytics {
  rows: CreatorInstallRow[];
  totals: { installs: number };
}

export type AgentState = "draft" | "published" | "archived";

export type AgentVisibility = "unlisted" | "public";

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
  skills?: { slug: string }[];
  creator: StoreCreator;
  installsCount: number;
  publishedAt: string | null;
  updatedAt: string;
  state?: AgentState;
  visibility?: AgentVisibility;
}

export interface StoreCatalogPage {
  items: StoreAgentSummary[];
  hasMore: boolean;
}

export type StoreCatalogSort = "recent" | "installs";

export interface StoreCatalogQuery {
  q?: string;
  category?: string;
  integration?: string;
  sort?: StoreCatalogSort;
  page?: number;
  creator?: string;
}

export interface StoreAgentDetail {
  agent: StoreAgentSummary;
  ir: AgentIR;
}

export interface StoreCategory {
  slug: string;
  name: string;
}

export type StoreInstallTarget = "houston" | "claude_skill_zip" | "copy_paste";

export type ReportReason =
  | "spam"
  | "malicious"
  | "impersonation"
  | "inappropriate"
  | "other";

export interface ReportInput {
  reason: ReportReason;
  details?: string;
  contact?: string;
}

export interface ClaimInput {
  agentId: string;
  code: string;
}

export interface ClaimResult {
  agentId: string;
  slug?: string;
}

export type MyAgent = StoreAgentSummary;

export interface AgentIdentityPatch {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  creator?: StoreCreator;
}

export type AgentPatch =
  | { identity: AgentIdentityPatch }
  | { ir: AgentIR }
  | { publish: true }
  | { unpublish: true }
  | { visibility: "unlisted" }
  | { requestPublic: true };

export interface PatchAgentResponse {
  agent: StoreAgentSummary;
}

export interface CreateAgentRequest {
  ir: AgentIR;
  publish?: boolean;
}

export interface CreateAgentResponse {
  agentId: string;
  slug?: string;
  shareUrl?: string;
}

export type AdminQueueItem = StoreAgentSummary;

export type ReportStatus = "open" | "resolved" | "dismissed";

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

export interface PurgeResult {
  draftsDeleted: number;
  softDeletedPurged: number;
}

export interface AdminGrantHandleInput {
  userId: string;
  displayName?: string;
}
