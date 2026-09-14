/**
 * Split a Bash command into the words a shell would see, so a path token that
 * a model quoted or backslash-escaped survives as ONE token. Most agents have
 * a space in their name ("Marketing Manager"), so their workspace path has one
 * too; splitting on whitespace cut `.../Personal/neqw copia` into an absolute
 * `.../Personal/neqw` that failed containment and denied the whole command.
 *
 * Deliberately a word splitter, not a parser: no expansion, no `$'…'`, no
 * heredocs. Quotes and backslashes group characters; whitespace, the control
 * operators (`;`, `|`, `&`, `(`, `)`, `<`, `>`) and backticks end a word. An
 * unterminated quote runs to the end of the command. Command substitution,
 * variables and redirection targets stay as porous as before; this only stops
 * the guard from inventing a path the command never named.
 */
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
        // Inside double quotes only `\"`, `\\`, `\$` and `` \` `` escape.
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
      // A trailing backslash is literal; otherwise it protects the next char
      // (`neqw\ copia` is one word).
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
