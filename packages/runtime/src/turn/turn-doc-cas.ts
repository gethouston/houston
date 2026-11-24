import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  fileSha256,
  StoreConflictError,
  withMergeBase,
} from "@houston/runtime-client/object-sync";
import {
  type DocRefreshTarget,
  refreshDocument,
  remoteKey,
} from "./turn-doc-refresh";
import { restoreTurnDocument, snapshotTurnDocument } from "./turn-doc-state";

const MAX_ATTEMPTS = 3;

export class TurnDocConflictError extends Error {
  readonly code = "document_conflict";

  constructor(readonly relativePath: string) {
    super(`document changed during this turn: ${relativePath}`);
    this.name = "TurnDocConflictError";
  }
}

export interface TurnDocCasOptions<T> extends DocRefreshTarget {
  apply: () => Promise<T>;
  shouldCommit?: (result: T) => boolean;
}

export async function mutateTurnDocument<T>(
  opts: TurnDocCasOptions<T>,
): Promise<T> {
  const key = remoteKey(opts.prefix, opts.relativePath);
  const local = join(
    opts.filesystem.storeRoot,
    ...opts.relativePath.split("/"),
  );
  const original = await snapshotTurnDocument(
    opts.filesystem,
    opts.relativePath,
    local,
  );
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const refreshed = await refreshDocument(opts);
      const beforeAttempt = await snapshotTurnDocument(
        opts.filesystem,
        opts.relativePath,
        local,
      );
      const result = await opts.apply();
      if (opts.shouldCommit && !opts.shouldCommit(result)) {
        await restoreTurnDocument(
          opts.filesystem,
          opts.relativePath,
          local,
          original,
        );
        return result;
      }
      const info = await stat(local);
      try {
        const uploaded = await opts.store.upload(local, key, {
          ifGenerationMatch: refreshed.generation ?? "0",
        });
        opts.filesystem.manifest.set(
          opts.relativePath,
          await withMergeBase(local, opts.relativePath, {
            hash: await fileSha256(local, info.size),
            generation: uploaded?.generation ?? refreshed.generation,
          }),
        );
        opts.filesystem.immediateWrites.add(opts.relativePath);
        opts.filesystem.landed?.add([opts.relativePath]);
        return result;
      } catch (error) {
        if (!(error instanceof StoreConflictError)) throw error;
        await restoreTurnDocument(
          opts.filesystem,
          opts.relativePath,
          local,
          beforeAttempt,
        );
        if (!refreshed.refreshable) break;
      }
    }
    throw new TurnDocConflictError(opts.relativePath);
  } catch (error) {
    await restoreTurnDocument(
      opts.filesystem,
      opts.relativePath,
      local,
      original,
    );
    throw error;
  }
}
