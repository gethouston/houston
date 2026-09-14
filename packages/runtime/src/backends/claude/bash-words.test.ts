import { expect, test } from "vitest";
import { bashWords } from "./bash-words";

test("splits on whitespace and control operators like the old splitter", () => {
  expect(bashWords("ls ./sub && echo hi; cat /etc/passwd | wc -l")).toEqual([
    "ls",
    "./sub",
    "echo",
    "hi",
    "cat",
    "/etc/passwd",
    "wc",
    "-l",
  ]);
  expect(bashWords("echo x >/tmp/out 2>&1 $(cat ~/s) `ls`")).toEqual([
    "echo",
    "x",
    "/tmp/out",
    "2",
    "1",
    "$",
    "cat",
    "~/s",
    "ls",
  ]);
});

test("double quotes, single quotes and backslashes keep a spaced path whole", () => {
  const root = "/ws/Personal/neqw copia";
  expect(bashWords(`cd "${root}" && ls`)).toEqual(["cd", root, "ls"]);
  expect(bashWords(`ls '${root}'`)).toEqual(["ls", root]);
  expect(bashWords("ls /ws/Personal/neqw\\ copia")).toEqual(["ls", root]);
  // Mixed: a quoted run glued to bare text is one word.
  expect(bashWords("cat /ws/\"Personal\"/neqw' copia'/a.txt")).toEqual([
    "cat",
    `${root}/a.txt`,
  ]);
});

test("double-quote escapes and an unterminated quote", () => {
  expect(bashWords('echo "a \\"b\\" \\$x \\n"')).toEqual([
    "echo",
    'a "b" $x \\n',
  ]);
  expect(bashWords("cat 'unterminated /etc/x")).toEqual([
    "cat",
    "unterminated /etc/x",
  ]);
  expect(bashWords('echo ""')).toEqual(["echo", ""]);
  expect(bashWords("echo a\\")).toEqual(["echo", "a\\"]);
});
