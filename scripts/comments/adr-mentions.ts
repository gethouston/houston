import { posix } from "node:path";

export interface RepoView {
  roots: ReadonlySet<string>;
  retired: ReadonlySet<string>;
  isFile(path: string): boolean;
  isDir(path: string): boolean;
  under(dir: string, suffix: string): string[];
  source(path: string): string;
  inCode(word: string): boolean;
}

export interface Mention {
  line: number;
  text: string;
  start: number;
  end: number;
  ticked: boolean;
}

const CODE_EXT = /\.(?:[cm]?[jt]sx?|rs|css|sh|toml|ya?ml)$/;
const PATH_CHARS = /^[\w@.[\]()+-]+(?:\/[\w@.[\]()+-]*)*$/;
const NOT_TRACKED =
  /(?:^|\/)(?:(?:dist|target|node_modules)\/|\.env(?:\.[\w-]+)*$)/;

function clean(raw: string): string {
  let path = raw.replace(/[.,;:]+$/, "");
  while (path.endsWith(")") && path.split(")").length > path.split("(").length)
    path = path.slice(0, -1).replace(/[.,;:]+$/, "");
  return path.replace(/\/+$/, "");
}

export function retiredPath(path: string, repo: RepoView): boolean {
  return [...repo.retired].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function absolute(path: string, repo: RepoView): boolean {
  return repo.roots.has(path.split("/")[0]);
}

function looksLikePath(path: string, repo: RepoView): boolean {
  if (!PATH_CHARS.test(path) || NOT_TRACKED.test(path)) return false;
  if (path.startsWith(".") && !absolute(path, repo)) return false;
  if (absolute(path, repo)) return path.includes("/");
  return CODE_EXT.test(path);
}

export function mentionsOf(
  lines: readonly string[],
  repo: RepoView,
): Mention[] {
  const out: Mention[] = [];
  const bare = /(?<![\w./`-])([\w.-]+\/[\w@.[\]()+/-]+)/g;
  lines.forEach((text, index) => {
    const ticks: [number, number][] = [];
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const start = match.index;
      ticks.push([start, start + match[0].length]);
      const path = clean(match[1]);
      if (looksLikePath(path, repo))
        out.push({
          line: index + 1,
          text: path,
          start,
          end: start + match[0].length,
          ticked: true,
        });
    }
    for (const match of text.matchAll(bare)) {
      const start = match.index;
      if (ticks.some(([s, e]) => start >= s && start < e)) continue;
      if (/^https?:|\/\/$/.test(text.slice(Math.max(0, start - 8), start)))
        continue;
      const path = clean(match[1]);
      if (absolute(path, repo) && looksLikePath(path, repo))
        out.push({
          line: index + 1,
          text: path,
          start,
          end: start + match[0].length,
          ticked: false,
        });
    }
  });
  return out;
}

export function exists(path: string, repo: RepoView): boolean {
  return repo.isFile(path) || repo.isDir(path);
}

export function basesOf(
  mentions: readonly Mention[],
  repo: RepoView,
): string[] {
  const bases = new Set<string>();
  for (const { text } of mentions) {
    if (!absolute(text, repo)) continue;
    if (repo.isDir(text)) bases.add(text);
    else if (repo.isFile(text)) bases.add(posix.dirname(text));
  }
  return [...bases];
}

export function resolveMention(
  path: string,
  bases: readonly string[],
  repo: RepoView,
): string[] {
  if (absolute(path, repo) && exists(path, repo)) return [path];
  return [...new Set(bases.flatMap((base) => repo.under(base, path)))];
}
