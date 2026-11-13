import { basename, dirname } from "node:path";
import { storeSyncRunsLock } from "../schedule/runs-lock";
import { StoreSyncDaemon } from "../store-sync";
import { FsVfs } from "../vfs";
import { SyncedStoreVfs } from "../vfs/synced-store";
import { severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";

export function createHostFiles(opts: LocalHostOptions) {
  const prefix = basename(opts.workspacesRoot);
  const syncDaemon = opts.storeSync
    ? new StoreSyncDaemon({
        ...opts.storeSync,
        rootDir: dirname(opts.workspacesRoot),
        localWriteLock: storeSyncRunsLock(prefix),
        watchExcludeDirs: [opts.workspacesRoot],
        onFenceLost: opts.onStoreFenceLost,
        log: severityLog,
      })
    : undefined;
  const vfs = syncDaemon?.uploadStore
    ? new SyncedStoreVfs(
        opts.workspacesRoot,
        syncDaemon.uploadStore,
        (id, key, generation) =>
          syncDaemon.copyUpload(id, `${prefix}/${key}`, generation),
      )
    : new FsVfs(opts.workspacesRoot);
  return { vfs, syncDaemon };
}
