import type { CustomExecutor } from "./executor-host";
import type { CustomToolInfo } from "./types";

/**
 * The compiled tools behind one integration, for the detail card's list. The
 * executor's own internal tools live under the reserved "executor" integration
 * and never match a user slug, so a plain equality filter is sufficient.
 */
export async function toolsOf(
  executor: CustomExecutor,
  slug: string,
): Promise<CustomToolInfo[]> {
  const tools = await executor.tools.list();
  return tools
    .filter((t) => t.integration === slug)
    .map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
    }));
}
