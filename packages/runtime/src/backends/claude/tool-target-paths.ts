import { isAbsolute } from "node:path";

/** The path(s) a tool call would touch, for clamping. */
export function targetPaths(
  toolName: string,
  input: Record<string, unknown>,
): string[] {
  switch (toolName) {
    case "Read":
    case "Edit":
    case "Write": {
      const fp = input.file_path;
      return typeof fp === "string" ? [fp] : [];
    }
    case "Glob":
    case "Grep": {
      const targets: string[] = [];
      if (typeof input.path === "string") targets.push(input.path);
      // Glob's real target is its PATTERN, not `path`: with no `path`, the
      // pattern is resolved against cwd, so an absolute/`~`/`..`-escaping
      // pattern (e.g. `Glob({pattern:"/etc/**/*.conf"})`) reads OUTSIDE the
      // workspace unless clamped. A benign relative glob (`**/*.ts`) has no
      // escape anchor, resolves under cwd, and is left to the default.
      if (typeof input.pattern === "string" && isEscapeToken(input.pattern))
        targets.push(input.pattern);
      return targets;
    }
    case "Bash": {
      const cmd = input.command;
      return typeof cmd === "string" ? bashEscapeCandidates(cmd) : [];
    }
    default:
      return [];
  }
}

/**
 * Path tokens in a Bash command that could escape the workspace: absolute (`/`),
 * home (`~`), or a `..` segment that climbs out of cwd — `cat ../../etc/passwd`
 * is relative AND escapes, so `..` must be caught here too. Each candidate is
 * clamped; any escape denies the whole command.
 *
 * This is NOT a security boundary. Arbitrary Bash is inherently porous —
 * redirections, `$HOME`, env expansion, and `$(...)` command substitution all
 * evade flat token inspection. This layer is defense-in-depth that must at least
 * not fail open on the trivial absolute/`~`/`..` cases. Conservative by design:
 * over-denying an odd path token is safer than leaking a read.
 */
function bashEscapeCandidates(command: string): string[] {
  return command.split(/[\s;|&()<>"'`]+/).filter(isEscapeToken);
}

/**
 * A path token or glob pattern that could resolve OUTSIDE the workspace and so
 * must be clamped: an absolute path (leading `/`, a Windows drive/UNC), a `~`
 * home reference, or any `..` segment that can climb out of cwd. Benign relative
 * inputs (a recursive `src` glob, `./sub`) return false and stay under cwd. For
 * glob patterns we deliberately do NOT parse magic — only the leading anchor
 * matters for escape detection.
 */
function isEscapeToken(token: string): boolean {
  if (isAbsolute(token) || token.startsWith("~")) return true;
  // Split on both separators so a `..` segment is caught on POSIX and Windows.
  return token.split(/[/\\]+/).includes("..");
}
