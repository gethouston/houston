import { BrowserToolError } from "./errors";

let generations = 0;

export function nextGeneration(): number {
  generations += 1;
  return generations;
}

const PLAYWRIGHT_REF = /\[ref=((?:f\d+)?e\d+)\]/g;
const STAMPED_REF = /^s(\d+)((?:f\d+)?e\d+)$/;

export function stampRefs(tree: string, generation: number): string {
  return tree
    .split("\n")
    .map((line) => {
      const item = ITEM_LINE.exec(line);
      if (!item) return line;
      return `${item[1]}${mapOwnAttrs(item[2] ?? "", (attrs) =>
        attrs.replace(PLAYWRIGHT_REF, `[ref=s${generation}$1]`),
      )}`;
    })
    .join("\n");
}

const ITEM_LINE = /^(\s*- )(.*)$/;
const ITEM_HEAD = /^(\/?[\w-]+(?: "(?:[^"\\]|\\.)*")?)((?: \[[^\]]*\])*)/;

export function mapOwnAttrs(
  content: string,
  rewrite: (attrs: string) => string,
): string {
  return content.replace(
    ITEM_HEAD,
    (_all, head: string, attrs: string) => `${head}${rewrite(attrs)}`,
  );
}

export function ownRef(content: string): string | undefined {
  const attrs = ITEM_HEAD.exec(content)?.[2] ?? "";
  return /\[ref=((?:f\d+)?e\d+)\]/.exec(attrs)?.[1];
}

export function resolveRef(tab: { generation: number }, raw: string): string {
  const match = STAMPED_REF.exec(raw);
  if (!match?.[2] || Number(match[1]) !== tab.generation)
    throw new BrowserToolError(
      "stale_ref",
      "That ref is from an older look at the page (it changed since). Take a snapshot and use a ref from it, exactly as printed (like s7e12).",
    );
  return match[2];
}
