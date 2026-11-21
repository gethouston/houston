export interface ContextCommandItem {
  id: "compact" | "clear";
  text: string;
  labelKey: `contextCommands.${"compact" | "clear"}`;
}

export const CONTEXT_COMMANDS: readonly ContextCommandItem[] = [
  { id: "compact", text: "/compact", labelKey: "contextCommands.compact" },
  { id: "clear", text: "/clear", labelKey: "contextCommands.clear" },
];
