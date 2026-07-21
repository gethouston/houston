import {
  HANDLE_REGEX,
  normalizeHandle,
  RESERVED_HANDLES,
} from "@houston/agentstore-contract";
import type { HandleAvailability } from "@houston-ai/engine-client";
import { useEffect, useState } from "react";
import { getEngine } from "../lib/engine";
import { reportError } from "../lib/error-toast";

/** Live availability state for the handle the user is typing. */
export type HandleStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "result"; availability: HandleAvailability };

/** How long typing must settle before the gateway availability check fires. */
const DEBOUNCE_MS = 300;

/**
 * Live @handle availability as the user types, for the profile editor's inline
 * hint. Grammar and reservation are decided CLIENT-SIDE first (via the shared
 * `@houston/agentstore-contract` rules), so an invalid or reserved handle
 * resolves instantly with no request; only a well-formed, unreserved handle
 * pays a debounced ({@link DEBOUNCE_MS}) `GET /handles/{handle}/available`
 * round-trip. The raw input is normalized before every check, so leading `@`,
 * surrounding whitespace, and case never cause a spurious miss.
 *
 * A failed availability request captures to Sentry (via {@link reportError}) but
 * does NOT toast — it is a passive per-keystroke check, and a toast on every
 * transient failure would wall the editor; the field simply falls back to
 * `idle` and the caller keeps the Save affordance neutral.
 */
export function useHandleAvailability(rawHandle: string): HandleStatus {
  const [status, setStatus] = useState<HandleStatus>({ state: "idle" });
  const handle = normalizeHandle(rawHandle);

  useEffect(() => {
    if (handle === "") {
      setStatus({ state: "idle" });
      return;
    }
    if (!HANDLE_REGEX.test(handle)) {
      setStatus({
        state: "result",
        availability: { available: false, reason: "invalid" },
      });
      return;
    }
    if (RESERVED_HANDLES.has(handle)) {
      setStatus({
        state: "result",
        availability: { available: false, reason: "reserved" },
      });
      return;
    }

    setStatus({ state: "checking" });
    let cancelled = false;
    const timer = setTimeout(() => {
      getEngine()
        .checkStoreHandle(handle)
        .then((availability) => {
          if (!cancelled) setStatus({ state: "result", availability });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          reportError("store_check_handle", "checkStoreHandle failed", err);
          setStatus({ state: "idle" });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  return status;
}
