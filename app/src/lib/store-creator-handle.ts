import {
  HANDLE_REGEX,
  normalizeHandle,
} from "@houston/agentstore-contract/handle";
import { paramFromStoreDeepLink } from "./store-deeplink-parse.ts";

/**
 * Parse and validate a store-creator target into a canonical creator @handle, or
 * `null` when the input is not a safe creator request.
 *
 * Two accepted shapes, one validator:
 *  - The desktop deep link `houston://store/creator?handle=<handle>` (the raw URL
 *    the Rust shell stashes + emits on the shared `store://deep-link` event, and
 *    the cold-start `take_pending_store_deep_link` drain returns).
 *  - A bare handle (the web `?creator=<handle>` query param, already decoded by
 *    `URLSearchParams`).
 *
 * The candidate is normalized (trim, strip one leading `@`, lowercase) exactly
 * like `use-handle-availability.ts` and the website, then validated against the
 * canonical `HANDLE_REGEX` from `@houston/agentstore-contract` — the same grammar
 * the gateway enforces, so nothing but `^[a-z0-9][a-z0-9_]{1,29}$` ever reaches
 * the creator pane. Path traversal, injected query, and out-of-grammar input all
 * fail the regex and return `null`.
 *
 * Imported from the `/handle` subpath (not the package barrel) so this stays a
 * pure, dependency-light module the frontend test can load under `node --test`.
 */
export function parseStoreCreatorHandle(input: string): string | null {
  const raw = input.startsWith("houston://")
    ? paramFromStoreDeepLink(input, "creator", "handle")
    : input;
  if (raw === null) return null;
  const handle = normalizeHandle(raw);
  return HANDLE_REGEX.test(handle) ? handle : null;
}
