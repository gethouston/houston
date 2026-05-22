/**
 * Test stub for `lib/logger.ts`.
 *
 * The real logger writes to a Tauri-backed file sink that doesn't exist
 * under `node --test`. This stub swallows all log calls — tests that
 * care about logging output should assert via a custom spy instead.
 */

export const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
};
