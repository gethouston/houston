// Low-level HTTP core for the GCIP REST calls. Owns transport + the ONE place
// GCIP error bodies become typed `IdentityError`s. Every non-2xx and every
// transport failure throws typed — nothing is swallowed (no-silent-failures).

import { IdentityError, mapGcipCode } from "./errors.ts";

export const IDENTITY_TOOLKIT_BASE =
  "https://identitytoolkit.googleapis.com/v1";
export const SECURE_TOKEN_BASE = "https://securetoken.googleapis.com/v1";

interface GcipErrorBody {
  error?: { code?: number; message?: string };
}

async function toIdentityError(res: Response): Promise<IdentityError> {
  let body: GcipErrorBody | null = null;
  try {
    body = (await res.json()) as GcipErrorBody;
  } catch {
    body = null;
  }
  const rawCode = body?.error?.message?.trim();
  if (rawCode) {
    return new IdentityError(mapGcipCode(rawCode), {
      rawCode,
      httpStatus: res.status,
    });
  }
  return new IdentityError("unknown", { httpStatus: res.status });
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await res.json()) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new IdentityError("malformed_response", { httpStatus: res.status });
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof IdentityError) throw e;
    throw new IdentityError("malformed_response", {
      httpStatus: res.status,
      cause: e,
    });
  }
}

/** POST a JSON body to an identitytoolkit endpoint; return the parsed object. */
export async function postGcipJson(
  url: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new IdentityError("network", { cause: e });
  }
  if (!res.ok) throw await toIdentityError(res);
  return readJsonBody(res);
}

/** POST a form-encoded body (securetoken refresh); return the parsed object. */
export async function postGcipForm(
  url: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (e) {
    throw new IdentityError("network", { cause: e });
  }
  if (!res.ok) throw await toIdentityError(res);
  return readJsonBody(res);
}
