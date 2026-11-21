const QUOTED_ITEM = /^(\s*- )'(.*)$/;

export function unquoteItemKeys(tree: string): string {
  return tree
    .split("\n")
    .map((line) => {
      const match = QUOTED_ITEM.exec(line);
      if (!match) return line;
      const [, head = "", body = ""] = match;
      const key = closeSingleQuoted(body);
      return key ? `${head}${key.text}${body.slice(key.end)}` : line;
    })
    .join("\n");
}

function closeSingleQuoted(
  body: string,
): { text: string; end: number } | undefined {
  let text = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "'") {
      text += body[i];
    } else if (body[i + 1] === "'") {
      text += "'";
      i++;
    } else {
      return { text, end: i + 1 };
    }
  }
  return undefined;
}
