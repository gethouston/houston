/**
 * URL-vs-file-path detection for links the agent emits in chat. The click
 * handling itself lives in `hooks/use-open-agent-file.tsx` (`useOpenAgentHref`);
 * this stays a pure predicate so non-React code can share it.
 *
 * Anything with a scheme (`<word>:`) or starting with `//` is a URL.
 * Everything else is a workspace file path — e.g. `perfil.md`,
 * `subfolder/output.docx`, `./report.pdf` — which the agent's prompt
 * structure encourages dropping straight after writing a file.
 */
export function looksLikeUrl(value: string): boolean {
  if (value.startsWith("//")) return true;
  // Scheme: a leading run of letters / digits / + - . followed by `:`.
  // Catches http, https, mailto, file, houston (deep-link),
  // etc. without false-positiving on Windows-style `C:\...` paths
  // because `C:` is followed by `\`, not by a non-`/`-non-`\` payload
  // — we additionally require a `/` immediately after the colon OR
  // a non-path-separator character (e.g. `mailto:user@example.com`).
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+\-.]*):(.+)/.exec(value);
  if (!schemeMatch) return false;
  const rest = schemeMatch[2];
  // Windows drive paths look like `C:\foo` or `C:/foo`. Both have a
  // path separator immediately after the colon. Treat as path, not URL.
  if (rest.startsWith("\\")) return false;
  // `c:/foo` is ambiguous — could be a Windows path or a single-letter
  // custom scheme. We side with "path" because no real Houston-emitted
  // scheme is one letter.
  if (rest.startsWith("/") && schemeMatch[1].length === 1) return false;
  return true;
}
