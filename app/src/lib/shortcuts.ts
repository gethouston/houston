import { isMac } from "./platform";

export type ShortcutAction =
  | "newMission"
  | "palette"
  | "missionControl"
  | "prevAgent"
  | "nextAgent"
  | "boardUp"
  | "boardDown"
  | "boardLeft"
  | "boardRight"
  | "boardOpen"
  | "cheatsheet";

interface ShortcutDef {
  /** Individual key chunks. One chunk per `<Kbd>` chip when rendered. */
  parts: string[];
  /** Whether the binding fires when typing in inputs. Default: never. */
  match: (e: KeyboardEvent) => boolean;
}

const cmd = (e: KeyboardEvent) =>
  isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;

const mod = isMac ? "⌘" : "Ctrl";

const shortcuts: Record<ShortcutAction, ShortcutDef> = {
  newMission: {
    parts: [mod, "N"],
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && (e.key === "n" || e.key === "N"),
  },
  palette: {
    parts: [mod, "K"],
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K"),
  },
  missionControl: {
    parts: [mod, "M"],
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && (e.key === "m" || e.key === "M"),
  },
  prevAgent: {
    parts: [mod, "["],
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && e.key === "[",
  },
  nextAgent: {
    parts: [mod, "]"],
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && e.key === "]",
  },
  boardUp: {
    parts: ["↑"],
    match: (e) =>
      e.key === "ArrowUp" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardDown: {
    parts: ["↓"],
    match: (e) =>
      e.key === "ArrowDown" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardLeft: {
    parts: ["←"],
    match: (e) =>
      e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardRight: {
    parts: ["→"],
    match: (e) =>
      e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardOpen: {
    parts: ["↵"],
    match: (e) =>
      e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  cheatsheet: {
    parts: ["?"],
    match: (e) => !cmd(e) && !e.altKey && e.shiftKey && e.key === "?",
  },
};

export function shortcutParts(action: ShortcutAction): string[] {
  return shortcuts[action].parts;
}

export function shortcutLabel(action: ShortcutAction): string {
  const parts = shortcuts[action].parts;
  // Mac uses glyph clusters with no separator (⌘K). Other platforms use "+".
  return isMac ? parts.join("") : parts.join("+");
}

export function matchShortcut(action: ShortcutAction, e: KeyboardEvent): boolean {
  return shortcuts[action].match(e);
}

/**
 * True if the keystroke originated from somewhere the user is typing
 * (input, textarea, contentEditable). Most shortcuts skip in that case so
 * we don't steal characters from the composer.
 */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * True when the typing target exists but holds no text yet. Used by
 * arrow-key shortcuts so an auto-focused, still-empty composer doesn't
 * swallow board navigation — there's no cursor motion to perform until
 * the user types something.
 */
export function isEmptyEditable(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return (t.textContent ?? "").length === 0;
  const v = (t as HTMLInputElement | HTMLTextAreaElement).value;
  return typeof v === "string" && v.length === 0;
}
