import { ASSISTANT_UNAVAILABLE_HERE } from "@houston/domain/assistant-deployment";
import type { AssistantError } from "./assistant-result";

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
  } catch {}
  const detail = message ?? text.slice(0, 300);
  if (code === "plan_mode") {
    return { code: "plan_mode", status: res.status, message: detail };
  }
  if (code === "not_in_turn") {
    return { code: "not_in_turn", status: res.status, message: detail };
  }
  if (code === "protected_conversation") {
    return {
      code: "protected_conversation",
      status: res.status,
      message: detail,
    };
  }
  if (code === ASSISTANT_UNAVAILABLE_HERE) {
    return {
      code: ASSISTANT_UNAVAILABLE_HERE,
      status: res.status,
      message: detail,
    };
  }
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
