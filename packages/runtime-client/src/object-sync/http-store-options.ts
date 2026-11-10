/** Construction options for an agent-scoped HTTP object store. */
export interface HttpObjectStoreOptions {
  /** Full agent-scoped base URL ending in `/v1/pod/store/<org>/<agent>`. */
  baseUrl: string;
  token: string;
  /** Shared routes additionally bind the pod token to its own agent slug. */
  agentSlug?: string;
  fetchImpl?: typeof fetch;
  /** One delay per retry of a transient failure; override to speed up tests. */
  retryDelaysMs?: number[];
  /** Stable for this engine boot and sent only after a fencing token is seen. */
  bootId?: string;
  /** Mutable lease token shared by every agent-prefix request in this boot. */
  fence?: { token?: string };
  /** Per-conversation mutation authority for a pooled worker turn. */
  claim?: { token: string; bootId: string; conversationId: string };
  /**
   * Hydrate small objects through the batched `POST /batch` read. Off unless
   * set: only the per-turn worker's store opts in, so a standing pod's store
   * sync keeps one GET per object.
   */
  batchReads?: boolean;
}

/** A store writes under a boot lease (bootId + fence) or a turn claim, never
 *  both and never half a lease. */
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
