export interface AssistantDocs {
  description?: string;
  group?: string;
  confirm: boolean;
  hidden: boolean;
}

function cleanBlock(block: string): string[] {
  return block
    .replace(/^\s*\/\*\*/, "")
    .replace(/\*\/\s*$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\* ?/, "").trimEnd());
}

export function parseAssistantDocs(block?: string): AssistantDocs {
  if (!block) return { confirm: false, hidden: false };
  const lines = cleanBlock(block);
  const descriptionLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("@") || (line === "" && descriptionLines.length > 0)) {
      break;
    }
    if (line) descriptionLines.push(line.trim());
  }
  const assistantText = lines
    .filter((line) => line.startsWith("@assistant"))
    .map((line) => line.slice("@assistant".length).trim())
    .join(" ");
  const group = assistantText.match(/(?:^|\s)group:([a-z0-9-]+)/)?.[1];
  return {
    description: descriptionLines.join(" ") || undefined,
    group,
    confirm: /(?:^|\s)confirm(?:\s|$)/.test(assistantText),
    hidden: /(?:^|\s)hidden(?:\s|$)/.test(assistantText),
  };
}

export function leadingJsDoc(
  source: string,
  start: number,
): string | undefined {
  const prefix = source.slice(0, start);
  const opening = prefix.lastIndexOf("/**");
  if (opening < 0) return undefined;
  const candidate = prefix.slice(opening);
  return /\*\/\s*$/.test(candidate) ? candidate : undefined;
}

export function humanizeMethodName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}
