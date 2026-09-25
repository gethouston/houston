import { toolShortName } from "@houston-ai/chat";

/**
 * The integration tool an AI Employee runs app actions with, and the one rule
 * for whether a run of it did what it asked. Every surface that reads an app
 * action's outcome from a transcript (the turn's "Updates made" rows, the
 * email lesson's proof of a send) asks HERE, so they can never disagree.
 *
 * Pure and DOM-free so the app's node:test suite covers it directly.
 */

const INTEGRATION_EXECUTE_TOOL = "integration_execute";

/** Whether a tool call is `integration_execute`, under its plain name or the
 *  MCP-prefixed one a Claude backend gives it (`mcp__houston__…`). */
export function isIntegrationExecuteCall(name: string): boolean {
  return toolShortName(name) === INTEGRATION_EXECUTE_TOOL;
}

/**
 * Whether an `integration_execute` result is the app's own answer to an
 * action that ran. The tool also answers WITHOUT an error when nothing ran
 * (the app turned off for this AI Employee, no access, a stale action slug):
 * that guidance is prose, never the `{`/`[` JSON of the app's data or the bare
 * "Done." an action with no data returns
 * (`packages/runtime/src/session/tools/integrations.ts`).
 */
export function integrationExecuteSucceeded(
  result: { content: string; is_error: boolean } | null | undefined,
): boolean {
  if (!result || result.is_error) return false;
  const content = result.content.trimStart();
  return (
    content.startsWith("{") || content.startsWith("[") || content === "Done."
  );
}
