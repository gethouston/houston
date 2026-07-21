import { isHoustonEngineError } from "@houston-ai/engine-client";

/**
 * Maps a failed profile-save to the editor's response. Kept out of
 * `profile-form.ts` (which stays runtime-dependency-free for the node test
 * runner) because reading the gateway token needs the engine-client value
 * import.
 */

/** Handle-specific gateway tokens → the localized handle-field message key.
 *  A token absent from this map is a non-handle failure (→ a generic toast). */
export const HANDLE_ERROR_KEYS: Record<string, string> = {
  handle_taken: "profile.handleTaken",
  handle_reserved: "profile.handleReserved",
  invalid_handle: "profile.handleInvalid",
  handle_change_too_soon: "profile.handleChangeTooSoon",
};

/**
 * The machine token from an agentstore-gateway error. The gateway returns a
 * flat `{ error: "<token>" }` envelope; this also tolerates the host's nested
 * `{ error: { code } }` shape so a single reader covers both surfaces.
 */
export function gatewayErrorCode(err: unknown): string | null {
  if (!isHoustonEngineError(err)) return null;
  const body = err.body as unknown;
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string") return e;
    if (e && typeof e === "object" && "code" in e) {
      const code = (e as { code: unknown }).code;
      return typeof code === "string" ? code : null;
    }
  }
  return null;
}
