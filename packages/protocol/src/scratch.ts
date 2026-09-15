/**
 * The ONE name every Houston process gives a half-written file inside a
 * workspace tree.
 *
 * Houston writes durably by `write(tmp)` + `rename(tmp, destination)`, and the
 * tmp must live in the destination's own directory (rename is atomic only
 * within a filesystem) — which means it lands INSIDE the tree the store sync
 * walks and the Files tab lists. Two readers must agree on which files those
 * are: the walk, so a half-written file is never published as content, and the
 * listing, so it is never shown. A plain `.tmp` suffix cannot be that
 * agreement — it is also a name users give their own files, and excluding it
 * wholesale lost a user's `notes.tmp` at pod teardown without a word.
 *
 * So the suffix is deliberately distinctive: nothing a person would type, and
 * `notes.tmp` / `backup.1.tmp` stay visible and stay synced.
 *
 * It lives in `@houston/protocol` because the producers and the excluders sit
 * in packages that share only this one dependency (host, runtime,
 * runtime-client) — a second definition anywhere is a silent data leak or a
 * silent data loss, depending on which copy drifts.
 */
export const ATOMIC_TMP_SUFFIX = ".houston.tmp";

/** Whether this path or name is one of Houston's half-written scratch files. */
export const isAtomicTemp = (name: string): boolean =>
  name.endsWith(ATOMIC_TMP_SUFFIX);

/**
 * The scratch path to write before renaming onto `destination`. Pass `unique`
 * (a pid+random infix, a uuid) wherever two writers can target the same
 * destination at once and must not collide on the tmp itself.
 */
export const atomicTempPath = (destination: string, unique?: string): string =>
  unique
    ? `${destination}.${unique}${ATOMIC_TMP_SUFFIX}`
    : `${destination}${ATOMIC_TMP_SUFFIX}`;
