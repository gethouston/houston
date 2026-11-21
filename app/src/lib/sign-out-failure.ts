import { IdentityError } from "./identity/errors.ts";

export function signOutFailure(
  sessionClear: unknown,
  localData: unknown,
): IdentityError | null {
  if (sessionClear !== undefined)
    return typed(sessionClear, "session_clear_failed");
  if (localData !== undefined)
    return typed(localData, "local_data_clear_failed");
  return null;
}

function typed(
  cause: unknown,
  code: "session_clear_failed" | "local_data_clear_failed",
): IdentityError {
  return cause instanceof IdentityError
    ? cause
    : new IdentityError(code, { cause });
}
