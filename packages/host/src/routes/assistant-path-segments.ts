import type { AssistantRoute } from "../assistant/catalog";

function fullyDecoded(segment: string): string {
  let decoded = segment;
  for (;;) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return decoded;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
}

export function safeSegment(segment: string): boolean {
  const decoded = fullyDecoded(segment);
  return (
    decoded !== "" &&
    decoded !== "." &&
    decoded !== ".." &&
    !/[\\/]/.test(decoded) &&
    ![...decoded].some((c) => {
      const code = c.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  );
}

export function addressSegments(
  route: AssistantRoute,
  name: string,
  encoding: string,
  value: string,
): string[] {
  return encoding === "path" || route.path.includes(`/agents/{${name}}`)
    ? value.split("/")
    : [value];
}
