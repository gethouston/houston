const FM_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export function skillBodyOf(content: string): string {
  return content.replace(FM_BLOCK, "").trim();
}
