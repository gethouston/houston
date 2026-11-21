const KEEP_RECENT_ROUNDS = 3;

const MIN_CLEAR_CHARS = 2_000;

export const IMAGE_CHARS = 6_400;

const BATCH_CHARS = 120_000;

export interface ToolResultRef {
  id: string;
  round: number;
  chars: number;
}

export function staleResultIds(
  results: readonly ToolResultRef[],
  rounds: number,
): Set<string> {
  let clearedThrough = -1;
  for (let round = 0; round < rounds; round++) {
    const staleThrough = round - KEEP_RECENT_ROUNDS;
    if (staleThrough <= clearedThrough) continue;
    let pending = 0;
    for (const r of results) {
      if (r.round > clearedThrough && r.round <= staleThrough && clearable(r))
        pending += r.chars;
    }
    if (pending >= BATCH_CHARS) clearedThrough = staleThrough;
  }
  return new Set(
    results
      .filter((r) => r.round <= clearedThrough && clearable(r))
      .map((r) => r.id),
  );
}

function clearable(r: ToolResultRef): boolean {
  return r.chars >= MIN_CLEAR_CHARS;
}

const STUB = /^\[Cleared tool result: [^,\]]+, ([\d,]+) characters\. /;

export function clearedStub(
  toolName: string,
  chars: number,
  savedAt: readonly string[],
): string {
  const where =
    savedAt.length === 1
      ? `is saved at ${savedAt[0]} (relative to your working directory); read that file`
      : `is saved in these files (relative to your working directory): ${savedAt.join(", ")}; read them`;
  return `[Cleared tool result: ${toolName}, ${chars.toLocaleString("en-US")} characters. It was removed from the conversation to save space. The full result ${where} if you need it again.]`;
}

export function stubbedChars(text: string): number | undefined {
  const match = STUB.exec(text);
  return match?.[1] ? Number(match[1].replaceAll(",", "")) : undefined;
}
