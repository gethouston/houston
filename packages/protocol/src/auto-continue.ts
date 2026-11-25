export const AUTO_CONTINUE_MARKER = "<!--houston:auto_continue-->";

export function encodeAutoContinue(text: string): string {
  return `${AUTO_CONTINUE_MARKER}\n\n${text}`;
}

export function isAutoContinue(content: string): boolean {
  return content.startsWith(AUTO_CONTINUE_MARKER);
}

// WHY: Host and gateway both mint this; drift shows the person a prompt they never wrote. ADR-0017
export const HEARTBEAT_MARKER = "<!--houston:heartbeat-->";

const HEARTBEAT_PREFIX = `${AUTO_CONTINUE_MARKER}\n\n${HEARTBEAT_MARKER}\n`;

export function encodeHeartbeat(prompt: string): string {
  return encodeAutoContinue(`${HEARTBEAT_MARKER}\n${prompt}`);
}

export function isHeartbeat(content: string): boolean {
  return content.startsWith(HEARTBEAT_PREFIX);
}
