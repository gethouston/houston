import { logger } from "./logger";
import { tauriFiles, tauriSystem } from "./tauri";

/**
 * Open a link the agent emitted in chat. Two shapes land here:
 *
 *   1. Absolute URLs — `https://...`, `http://...`, `mailto:...`, `houston://...`,
 *      etc. These go to the system browser via `tauriSystem.openUrl`.
 *
 *   2. Relative or bare paths — e.g. `perfil.md`, `subfolder/output.docx`,
 *      `./report.pdf`. The agent's prompt structure encourages it to drop
 *      these straight after writing a file. They are NOT URLs; calling
 *      `openUrl("perfil.md")` on Windows silently does nothing
 *      (a real user reported "perfil.md pill doesn't open"). Resolve
 *      them against the current agent's working directory via
 *      `tauriFiles.open`, which goes through the engine's
 *      `open_file_in_agent` route and ends up at the OS's
 *      default-app handler.
 *
 * The detection is "does it look like a URL" — anything with a scheme
 * (`<word>:`) or starting with `//` is treated as a URL. Everything
 * else is a path.
 */
export function openAgentHref(href: string, agentPath: string): void {
  const trimmed = href.trim();
  if (!trimmed) return;
  if (looksLikeUrl(trimmed)) {
    tauriSystem.openUrl(trimmed).catch((e) => {
      logger.warn(`[open-href] openUrl(${trimmed}) failed: ${e}`);
    });
    return;
  }
  tauriFiles.open(agentPath, trimmed).catch((e) => {
    logger.warn(`[open-href] openFile(${trimmed}) failed: ${e}`);
  });
}

function looksLikeUrl(value: string): boolean {
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
