import type { CustomExecutor } from "./executor-host";
import type { CustomToolInfo } from "./types";

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
