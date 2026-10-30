import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { LazyStoreVfs } from "@houston/host/src/vfs";
import type {
  HydrateManifest,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import {
  segmentFileFor,
  totalMessageCount,
} from "../store/conversation-archive";
import { reportMissingSegment } from "../store/conversation-archive-missing";
import { segmentsInWindow } from "../store/conversation-archive-window";
import { loadConversation } from "../store/conversation-file";
import type { HistoryWindow } from "../store/conversation-queries";

/** Put on disk every archive segment a history window of one conversation
 *  reads, so the synchronous store readers that follow find them. */
export type ArchiveLoader = (
  conversationId: string,
  window: HistoryWindow,
) => Promise<void>;

/**
 * The lazy read behind a claimed turn's archive: the hot set hydrates only the
 * newest segments (turn-hot-set-archive.ts), and a reader that reaches further
 * back (a routine digest past them, houston_recall's full search) calls this
 * first. A missing segment is fetched from the store into the turn's tree and
 * entered in its manifest with the bytes' hash, exactly like a hydrated one:
 * the sync never re-uploads it, and a local delete of it reaches the store.
 * A segment the store does not have either is reported and fails the fetch
 * (ArchiveSegmentMissingError); the caller decides whether its read can go
 * on past the hole (conversation-archive-missing.ts).
 */
export function turnArchiveLoader(opts: {
  store: ObjectStore;
  prefix: string;
  storeRoot: string;
  dataRel: string;
  manifest: HydrateManifest;
  maxBytes: number;
}): ArchiveLoader {
  const dir = join(opts.storeRoot, ...opts.dataRel.split("/"), "conversations");
  // One overlay per archive: concurrent readers share its in-flight fetches.
  const overlays = new Map<string, Promise<LazyStoreVfs>>();
  const overlay = (archiveRel: string) => {
    let pending = overlays.get(archiveRel);
    if (!pending) {
      pending = listArchive(opts, archiveRel);
      // A failed listing is retried by the next reader, never cached.
      pending.catch(() => overlays.delete(archiveRel));
      overlays.set(archiveRel, pending);
    }
    return pending;
  };
  return async (conversationId, window) => {
    const conv = loadConversation(dir, conversationId);
    if (!conv?.archived) return;
    const missing = segmentsInWindow(
      conv.archived,
      totalMessageCount(conv),
      window,
    ).filter((n) => !existsSync(segmentFileFor(dir, conversationId, n)));
    if (missing.length === 0) return;
    const archiveRel = posix.join(
      opts.dataRel,
      "conversations",
      `${encodeURIComponent(conversationId)}.archive`,
    );
    const vfs = await overlay(archiveRel);
    // Every segment the store has lands before a lost one fails the fetch:
    // a caller that reads on past the hole loses only that segment.
    const lost: number[] = [];
    for (const n of missing) {
      if ((await vfs.readBytes(`${archiveRel}/${n}.json`)) === null)
        lost.push(n);
    }
    const errors = lost.map((n) =>
      reportMissingSegment(segmentFileFor(dir, conversationId, n)),
    );
    if (errors[0]) throw errors[0];
  };
}

async function listArchive(
  opts: Parameters<typeof turnArchiveLoader>[0],
  archiveRel: string,
): Promise<LazyStoreVfs> {
  if (!opts.store.manifest)
    throw new Error("this store cannot list an archive to fetch from");
  const objects = await opts.store.manifest(
    opts.prefix ? `${opts.prefix}/${archiveRel}` : archiveRel,
  );
  return new LazyStoreVfs({
    store: opts.store,
    prefix: opts.prefix,
    root: opts.storeRoot,
    objects,
    manifest: opts.manifest,
    excludes: [],
    maxObjectBytes: opts.maxBytes,
    maxBytes: opts.maxBytes,
  });
}
