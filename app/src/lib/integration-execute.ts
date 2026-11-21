import { toolShortName } from "@houston-ai/chat";

const INTEGRATION_EXECUTE_TOOL = "integration_execute";

export function isIntegrationExecuteCall(name: string): boolean {
  return toolShortName(name) === INTEGRATION_EXECUTE_TOOL;
}

export function integrationExecuteSucceeded(
  result: { content: string; is_error: boolean } | null | undefined,
): boolean {
  if (!result || result.is_error) return false;
  const content = result.content.trimStart();
  return (
    content.startsWith("{") || content.startsWith("[") || content === "Done."
  );
}
