import { isAbsolute } from "node:path";
import { bashWords } from "./bash-words";

export function bashEscapeCandidates(command: string): string[] {
  return bashWords(command).filter(isEscapeToken);
}

export function isEscapeToken(token: string): boolean {
  if (isAbsolute(token) || token.startsWith("~")) return true;
  return token.split(/[/\\]+/).includes("..");
}
