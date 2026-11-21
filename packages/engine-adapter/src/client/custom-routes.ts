import { HoustonEngineError } from "./errors";

export const customPath = (...segments: string[]) =>
  `/v1/integrations/custom/${segments.map(encodeURIComponent).join("/")}`;

export const agentCustomPath = (agent: string, ...segments: string[]) =>
  `/agents/${encodeURIComponent(agent)}/integrations/custom/${segments.map(encodeURIComponent).join("/")}`;

export async function whenServed<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

export async function whenSlugKnown<T>(
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (
      err instanceof HoustonEngineError &&
      err.status === 404 &&
      (err.body as { code?: string } | null)?.code !== "not_found"
    )
      return null;
    throw err;
  }
}
