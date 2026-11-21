import { DESKTOP_VIEWPORT } from "./live/layout";

type Env = Record<string, string | undefined>;

export interface Kernel {
  apiKey: string;
  fetch?: typeof fetch;
}

export interface KernelSession {
  id: string;
  connectUrl: string;
}

const API = "https://api.onkernel.com";

export const KERNEL_TIMEOUT_S = 600;

export class KernelError extends Error {
  constructor(readonly code: string) {
    super(`Kernel: ${code}`);
    this.name = "KernelError";
  }
}

export function kernelFrom(env: Env): Kernel | null {
  const apiKey = env.KERNEL_API_KEY?.trim();
  if (apiKey) return { apiKey };
  console.warn(
    "[browser] Kernel fallback off: KERNEL_API_KEY is not set. Set it to open sites that block this browser through a Kernel browser.",
  );
  return null;
}

export async function createKernelSession(
  kernel: Kernel,
): Promise<KernelSession> {
  const response = await call(kernel, "POST", "/browsers", {
    stealth: true,
    headless: true,
    timeout_seconds: KERNEL_TIMEOUT_S,
    viewport: DESKTOP_VIEWPORT,
  });
  const body = (await response.json().catch(() => ({}))) as {
    session_id?: unknown;
    cdp_ws_url?: unknown;
  };
  const id = typeof body.session_id === "string" ? body.session_id : null;
  if (id !== null && typeof body.cdp_ws_url === "string")
    return { id, connectUrl: body.cdp_ws_url };
  if (id !== null)
    await deleteKernelSession(kernel, id).catch((error: unknown) =>
      console.error(
        "[browser] ending a Kernel session failed",
        kernelCode(error),
      ),
    );
  throw new KernelError("no_session_in_answer");
}

export async function deleteKernelSession(
  kernel: Kernel,
  id: string,
): Promise<void> {
  await call(kernel, "DELETE", `/browsers/${encodeURIComponent(id)}`);
}

export function kernelCode(error: unknown): string {
  if (error instanceof KernelError) return error.code;
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  return error instanceof Error ? `error:${error.name}` : "error";
}

async function call(
  kernel: Kernel,
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  let response: Response;
  try {
    response = await (kernel.fetch ?? fetch)(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${kernel.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new KernelError(
      kernelCode(error) === "timeout" ? "timeout" : "unreachable",
    );
  }
  if (response.ok) return response;
  throw new KernelError(`${response.status}:${await errorCode(response)}`);
}

async function errorCode(response: Response): Promise<string> {
  const parsed: unknown = await response.json().catch(() => null);
  const code =
    parsed && typeof parsed === "object" && "code" in parsed
      ? parsed.code
      : null;
  return typeof code === "string" && /^[\w.-]{1,64}$/.test(code)
    ? code
    : "unknown";
}
