import { readdirSync, readFileSync } from "node:fs";

export type RoutePair = string;

const normalise = (path: string): string =>
  path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":param" : segment))
    .join("/");

const pair = (method: string, path: string): RoutePair =>
  `${method} ${normalise(path).replace(/^\//, "")}`;

function templates(source: string): string[] {
  const body = source
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .replace(/\\\//g, "/");
  const alternation = body.match(/\(([^()]*\|[^()]*)\)/);
  const single = body.replace(/\([^)]*\)/g, ":param");
  if (!alternation?.[1]) return [single];
  return alternation[1]
    .split("|")
    .map((option) =>
      body.replace(alternation[0], option).replace(/\([^)]*\)/g, ":param"),
    );
}

function matchConstants(file: string): Map<string, string> {
  const constants = new Map<string, string>();
  const pattern = /const (\w+) = (?:ctx\.)?path\.match\(\s*\/(.+?)\/,?\s*\)/gs;
  for (const found of file.matchAll(pattern))
    if (found[1] && found[2]) constants.set(found[1], found[2]);
  return constants;
}

function pairsIn(file: string): RoutePair[] {
  const pairs: RoutePair[] = [];
  const constants = matchConstants(file);
  const M = `(?:ctx\\.)?method`;
  const P = `(?:ctx\\.)?path`;
  for (const [, method, path] of file.matchAll(
    new RegExp(`${M} === "(\\w+)" && ${P} === "([^"]+)"`, "g"),
  ))
    if (method && path) pairs.push(pair(method, path));
  for (const [, method, path] of file.matchAll(
    new RegExp(`${M} !== "(\\w+)" \\|\\| ${P} !== "([^"]+)"`, "g"),
  ))
    if (method && path) pairs.push(pair(method, path));
  for (const [name, source] of constants) {
    const paths = templates(source);
    const methods = [
      ...file.matchAll(new RegExp(`${M} === "(\\w+)" && ${name}\\b`, "g")),
      ...file.matchAll(
        new RegExp(
          `${name} && \\(${M} === "(\\w+)" \\|\\| ${M} === "(\\w+)"`,
          "g",
        ),
      ),
    ].flatMap((found) =>
      found.slice(1).filter((value): value is string => !!value),
    );
    for (const method of methods)
      for (const path of paths) pairs.push(pair(method, path));
  }
  for (const [, method, action] of file.matchAll(
    new RegExp(`${M} === "(\\w+)" && action === "([\\w-]+)"`, "g"),
  )) {
    if (!method || !action) continue;
    for (const source of constants.values()) {
      const path = templates(source).find((option) =>
        option.endsWith(`/${action}`),
      );
      if (path) pairs.push(pair(method, path));
    }
  }
  return pairs;
}

export function runtimeTransportFiles(transportDir: URL): string[] {
  return readdirSync(transportDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts"),
    )
    .map((entry) => entry.name)
    .sort();
}

export function runtimeTransportRoutes(transportDir: URL): Set<RoutePair> {
  const pairs = new Set<RoutePair>();
  for (const name of runtimeTransportFiles(transportDir))
    for (const found of pairsIn(
      readFileSync(new URL(name, transportDir), "utf8"),
    ))
      pairs.add(found);
  return pairs;
}
