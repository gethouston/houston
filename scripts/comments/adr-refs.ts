import {
  basesOf,
  type Mention,
  mentionsOf,
  type RepoView,
  resolveMention,
  retiredPath,
} from "./adr-mentions.ts";

export type { RepoView } from "./adr-mentions.ts";

export interface AdrProblem {
  line: number;
  message: string;
}

const LEADING_SYMBOL = /^(?:- )?(?:\*\*[^*]+\*\*\s*)?`([^`]+)`/;
const SYMBOL = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;

function tickedList(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

const FILE_NAME = /\.(?:[cm]?[jt]sx?|rs|css|sh|json|md|toml|ya?ml|html)$/;

function symbolsIn(list: string[]): string[] {
  return list.filter((item) => SYMBOL.test(item) && !FILE_NAME.test(item));
}

const CONSTANT = /^[A-Z][A-Z\d]*(?:_[A-Z\d]+)*$/;
const SNAKE = /^[a-z][a-z\d]*(?:_[a-z\d]+)+$/;
const CAMEL = /[a-z\d][A-Z]|(?:^|\.)[A-Z][a-z]/;

function listedAfter(line: string, mention: Mention): string[] {
  if (!mention.ticked) return [];
  const after = /^\s*\(((?:`[^`]+`(?:,\s*(?:and\s+)?|\s+and\s+)?)+)\)/.exec(
    line.slice(mention.end),
  );
  return after ? symbolsIn(tickedList(after[1])) : [];
}

function namedBefore(line: string, mention: Mention): string[] {
  if (!mention.ticked) return [];
  const before = /`([^`]+)`\s+(\((?:in\s+)?|in\s+)$/.exec(
    line.slice(0, mention.start),
  );
  if (!before) return [];
  if (before[2].startsWith("(") && !/^[),]/.test(line.slice(mention.end)))
    return [];
  return symbolsIn([before[1]]);
}

function wordIn(source: string, word: string): boolean {
  return new RegExp(`(?<![\\w$])${word.replace(/\$/g, "\\$")}(?![\\w$])`).test(
    source,
  );
}

function missingParts(symbol: string, sources: readonly string[]): string[] {
  const parts = symbol.replace(/\(\)$/, "").split(".");
  return sources
    .map((source) => parts.filter((part) => !wordIn(source, part)))
    .reduce((a, b) => (b.length < a.length ? b : a), parts);
}

interface Resolved {
  mention: Mention;
  paths: string[];
}

export function checkAdr(text: string, repo: RepoView): AdrProblem[] {
  const lines = text.split("\n");
  const mentions = mentionsOf(lines, repo).filter(
    (mention) => !retiredPath(mention.text, repo),
  );
  const bases = basesOf(mentions, repo);
  const problems: AdrProblem[] = [];
  const resolved: Resolved[] = [];
  for (const mention of mentions) {
    const paths = resolveMention(mention.text, bases, repo);
    if (paths.length > 0) resolved.push({ mention, paths });
    else
      problems.push({
        line: mention.line,
        message: `names ${mention.text}, which does not exist`,
      });
  }
  const check = (line: number, symbols: string[], paths: string[]): void => {
    const sources = paths.map((path) => repo.source(path));
    for (const symbol of symbols) {
      const missing = missingParts(symbol, sources);
      if (missing.length > 0)
        problems.push({
          line,
          message: `names \`${symbol}\` next to ${paths.join(", ")}, which do not contain ${missing.join(", ")}`,
        });
    }
  };
  for (const { mention, paths } of resolved) {
    const text = lines[mention.line - 1];
    check(mention.line, namedBefore(text, mention), paths);
    const onLine = resolved
      .filter(
        (other) =>
          other.mention.line === mention.line &&
          other.mention.start <= mention.start,
      )
      .flatMap((other) => other.paths);
    check(mention.line, listedAfter(text, mention), [...new Set(onLine)]);
  }
  let section: string[] = [];
  lines.forEach((text, index) => {
    const line = index + 1;
    if (text.startsWith("#")) {
      section = resolved
        .filter((entry) => entry.mention.line === line)
        .flatMap((entry) => entry.paths);
      return;
    }
    const lead = LEADING_SYMBOL.exec(text);
    if (!lead || section.length === 0 || symbolsIn([lead[1]]).length === 0)
      return;
    const token = lead[1].replace(/\(\)$/, "");
    if (CONSTANT.test(token) || SNAKE.test(token)) {
      if (!repo.inCode(token))
        problems.push({
          line,
          message: `names \`${token}\`, which no code in the repo contains`,
        });
    } else if (CAMEL.test(token)) check(line, [token], section);
  });
  return problems.sort((a, b) => a.line - b.line);
}
