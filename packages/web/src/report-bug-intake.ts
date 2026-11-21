import { gatewayAuthFetch } from "@houston/engine-adapter/cp/fetch";

export async function reportBugViaGateway(
  cp: { baseUrl: string; token: string },
  payload: unknown,
): Promise<string | null> {
  const gatewayFetch = gatewayAuthFetch(cp.token);
  const res = await gatewayFetch(`${cp.baseUrl.replace(/\/+$/, "")}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const body = await readRefusal(res);
    const message =
      body.error ||
      `feedback failed (${res.status})${body.unreadable ? `: ${body.unreadable}` : ""}`;
    const kind =
      body.code === "intake_unavailable" ? "intake_unavailable" : "other";
    throw new FeedbackIntakeError(message, kind, res.status);
  }
  const out = (await res.json()) as { id: string | null };
  return out.id;
}

export class FeedbackIntakeError extends Error {
  constructor(
    message: string,
    readonly kind: "intake_unavailable" | "other",
    readonly status: number,
  ) {
    super(message);
    this.name = "FeedbackIntakeError";
  }
}

async function readRefusal(
  res: Response,
): Promise<{ error?: string; code?: string; unreadable?: string }> {
  try {
    return (await res.json()) as { error?: string; code?: string };
  } catch (err) {
    return {
      unreadable: `unreadable refusal body: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
