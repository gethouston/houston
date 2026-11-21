export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function positionOf(
  starts: readonly number[],
  offset: number,
): { line: number; col: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, col: offset - starts[low] + 1 };
}

export function lineStartOf(text: string, offset: number): number {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

export function lineEndOf(text: string, offset: number): number {
  const end = text.indexOf("\n", offset);
  return end < 0 ? text.length : end;
}

export function isBlank(line: string): boolean {
  return /^\s*$/.test(line);
}
