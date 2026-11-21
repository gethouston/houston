import type { ScriptLine } from "./script-types.ts";

export function openingRevealed(lines: readonly ScriptLine[]): Set<string> {
  const lastReceipt = lines.findLastIndex((line) => line.kind === "receipt");
  const revealed = new Set<string>();
  lines.forEach((line, index) => {
    if (line.kind === "manager" && index < lastReceipt) revealed.add(line.key);
  });
  return revealed;
}

export function nextUnrevealed(
  lines: readonly ScriptLine[],
  revealed: ReadonlySet<string>,
): number {
  return lines.findIndex(
    (line) => line.kind === "manager" && !revealed.has(line.key),
  );
}

export function revealFrames(text: string): string[] {
  const words = text.match(/\S+\s*/g) ?? [text];
  const frames: string[] = [];
  let shown = "";
  for (const word of words) {
    shown += word;
    frames.push(shown.trimEnd());
  }
  if (frames.at(-1) !== text) frames.push(text);
  return frames;
}
