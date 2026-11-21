export interface HttpObjectStoreOptions {
  baseUrl: string;
  token: string;
  agentSlug?: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  bootId?: string;
  fence?: { token?: string };
  claim?: { token: string; bootId: string; conversationId: string };
  batchReads?: boolean;
}

export function assertWriteAuthority(opts: HttpObjectStoreOptions): void {
  if (Boolean(opts.bootId) !== Boolean(opts.fence)) {
    throw new Error(
      "object store bootId and fence must be configured together",
    );
  }
  if (opts.claim && (opts.bootId || opts.fence)) {
    throw new Error(
      "object store claim authority cannot be combined with lease authority",
    );
  }
}
