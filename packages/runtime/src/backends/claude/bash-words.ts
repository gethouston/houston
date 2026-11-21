const WORD_BREAKS = new Set([";", "|", "&", "(", ")", "<", ">", "`"]);

export function bashWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  let i = 0;
  const push = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  while (i < command.length) {
    const ch = command[i] as string;
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      word += end === -1 ? command.slice(i + 1) : command.slice(i + 1, end);
      inWord = true;
      i = end === -1 ? command.length : end + 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      inWord = true;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === "\\" && /["\\$`]/.test(command[i + 1] ?? "")) {
          i += 1;
        }
        word += command[i];
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "\\") {
      word += command[i + 1] ?? "\\";
      inWord = true;
      i += 2;
      continue;
    }
    if (/\s/.test(ch) || WORD_BREAKS.has(ch)) {
      push();
      i += 1;
      continue;
    }
    word += ch;
    inWord = true;
    i += 1;
  }
  push();
  return words;
}
