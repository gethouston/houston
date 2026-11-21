import type { ComponentType, ReactNode } from "react";

export type StoreLinkComponent = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
}>;

export interface StoreAgentIcon {
  kind: "url" | "emoji";
  value: string;
}

export interface StoreCreatorRow {
  handle?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  verified?: boolean;
}

export interface StoreAgentRow {
  id: string;
  slug?: string | null;
  name: string;
  color?: string | null;
  icon?: StoreAgentIcon | null;
  tagline?: string | null;
  description: string;
  category?: string;
  tags?: string[];
  integrations: string[];
  skills?: readonly unknown[];
  installsCount: number;
  learningsCount?: number;
  creator: StoreCreatorRow;
}

export interface StoreCreatorProfile extends StoreCreatorRow {
  bio?: string | null;
}

export interface CreatorDirectoryRow extends StoreCreatorRow {
  handle: string;
  bio?: string | null;
  agentsCount: number;
  installsCount: number;
}

export type OwnedAgentState = "draft" | "published" | "archived";

export interface OwnedAgentRow extends StoreAgentRow {
  state?: OwnedAgentState;
  visibility?: "public" | "unlisted";
}

export interface OwnedAgentPatch {
  publish?: boolean;
  unpublish?: boolean;
  requestPublic?: boolean;
  visibility?: "unlisted";
}

export interface OwnedAgentIdentity {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
}

export interface InstallsDayBar {
  day: string;
  installs: number;
  fraction: number;
}

export interface StoreCategoryRow {
  slug: string;
  name: string;
}

export interface StoreSkillRow {
  slug: string;
  body: string;
}
