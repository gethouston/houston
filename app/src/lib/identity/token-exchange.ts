import { IdentityError } from "./errors.ts";

export async function postTokenForm(
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
  if (!res.ok) {
    let rawCode: string | undefined;
    try {
      const err = (await res.json()) as { error?: unknown };
      if (typeof err.error === "string") rawCode = err.error;
    } catch {
      rawCode = undefined;
    }
    throw new IdentityError("invalid_idp_response", {
      httpStatus: res.status,
      rawCode,
    });
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new IdentityError("malformed_response", {
      httpStatus: res.status,
      cause: e,
    });
  }
  if (typeof body !== "object" || body === null) {
    throw new IdentityError("malformed_response", { httpStatus: res.status });
  }
  return body as Record<string, unknown>;
}
