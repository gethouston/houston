import type { EngineNoticeKind } from "@houston/sdk";

export interface CachedFrame {
  feed_type: string;
  data: unknown;
  notice?: EngineNoticeKind;
  ts?: number;
  author?: { userId: string; name?: string };
  mentions?: { userId: string; name?: string }[];
  turnId?: string;
  toolIndex?: number;
}

export interface CacheRecord {
  frames: CachedFrame[];
  updatedAt: number;
}

export interface ConversationCacheBackend {
  get(key: string): Promise<CacheRecord | null>;
  set(key: string, record: CacheRecord): Promise<void>;
  delete(key: string): Promise<void>;
  keysOldestFirst(): Promise<string[]>;
  clear(): Promise<void>;
}
