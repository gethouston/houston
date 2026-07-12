/**
 * Shared building blocks for the routine and reaction setup-chat kickoffs
 * (`routine-chat-prompts.ts`, `reaction-chat-prompts.ts`). Kept apart so each
 * kickoff file stays focused and under the size cap.
 */

/** A provider the user has actually connected, for the kickoff prompts. */
export interface ConnectedProviderRef {
  id: string;
  name: string;
}

/**
 * The kickoffs tell the agent which model providers the user actually has
 * connected: without this it happily pins a routine to any provider the user
 * names (e.g. "use deepseek"), and it then fails at fire time.
 * `null` means the statuses haven't loaded yet — stay generic rather than
 * wrongly claiming nothing is connected.
 */
export function providerAwareness(
  connected: ConnectedProviderRef[] | null,
): string {
  if (connected === null) {
    return `Model providers: a routine can pin a specific provider and model, but only ones the user has actually connected in this app. If the user asks for a specific provider or model and you cannot confirm it is connected, do not set it — leave the routine's model setup unchanged and suggest they check the app's model settings.`;
  }
  const list = connected.length
    ? connected.map((c) => `"${c.id}" (${c.name})`).join(", ")
    : "none";
  return `Model providers: the only providers connected for this user are: ${list}. A routine's "provider" may only be one of those ids (or absent, to use this agent's own settings), and its "model" only a model that belongs to that provider. If the user asks to run the routine on any other provider or model, do NOT set it: tell them that provider is not connected yet (they can connect it from the app's model settings) and leave the routine's model setup unchanged. Never invent provider or model names.`;
}
