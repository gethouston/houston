import type { AssistantError } from "./assistant-result";

/**
 * Reading the host's answer when it is not a success.
 *
 * `houston_call` reports failures as RESULTS with a named code, never throws,
 * so the model can tell "I addressed this wrong" from "the user has to decide"
 * from "the server refused". These translate the host's own named codes into
 * that taxonomy; an unnamed failure keeps its status and reads as a refusal.
 */

/** Read the host's error body, preferring its named `code` over the status. */
export async function errorFromResponse(
  res: Response,
): Promise<AssistantError> {
  const text = await res.text().catch(() => "");
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null) {
      const fields = body as { code?: unknown; error?: unknown };
      if (typeof fields.code === "string") code = fields.code;
      if (typeof fields.error === "string") message = fields.error;
    }
  } catch {
    // A non-JSON body (a proxy's HTML error page) still carries the status.
  }
  const detail = message ?? text.slice(0, 300);
  if (code === "operation_not_supported") {
    return {
      code: "operation_not_supported",
      status: res.status,
      message: `This Houston install cannot perform that operation yet. Tell the user plainly and offer what you can do instead. (${detail})`,
    };
  }
  return {
    code: "gateway_error",
    status: res.status,
    message: `The operation was refused (HTTP ${res.status})${detail ? `: ${detail}` : ""}.`,
  };
}

/** The host's named refusal for an unapproved call, when it gave one. */
export async function approvalCode(res: Response): Promise<string | undefined> {
  if (res.status !== 403) return undefined;
  try {
    const body: unknown = JSON.parse(await res.text());
    if (typeof body !== "object" || body === null) return undefined;
    const code = (body as { code?: unknown }).code;
    return code === "approval_required" || code === "approval_denied"
      ? code
      : undefined;
  } catch {
    return undefined;
  }
}
