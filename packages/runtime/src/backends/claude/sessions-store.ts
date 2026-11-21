import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { clearStaleTranscriptResults } from "./transcript-clearing";
import {
  locateTranscript,
  removeTranscript,
  sdkProjectSlug,
} from "./transcript-files";

export interface SessionsStore {
  getSessionId(conversationId: string): string | undefined;
  setSessionId(conversationId: string, sessionId: string): void;
  remove(conversationId: string): void;
  purge(conversationId: string): void;
  resolveResume(conversationId: string): ClaudeResume | undefined;
}

export interface ClaudeResume {
  sessionId: string;
  clearedTokens: number;
}

export function createSessionsStore(input: {
  configDir: string;
  sessionsFile: string;
  cwd?: string;
}): SessionsStore {
  const baseDir = dirname(input.sessionsFile);
  const filePath = input.sessionsFile;
  const projectsDir = join(input.configDir, "projects");
  const { cwd } = input;
  const currentSlugDir = cwd
    ? join(projectsDir, sdkProjectSlug(cwd))
    : undefined;

  function read(): Record<string, string> {
    if (!existsSync(filePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function write(map: Record<string, string>): void {
    mkdirSync(baseDir, { recursive: true });
    const tmp = atomicTempPath(filePath);
    writeFileSync(tmp, JSON.stringify(map), { mode: 0o600 });
    renameSync(tmp, filePath);
  }

  function remove(conversationId: string): void {
    const map = read();
    if (!(conversationId in map)) return;
    delete map[conversationId];
    write(map);
  }

  function purge(conversationId: string): void {
    const sessionId = read()[conversationId];
    if (sessionId) removeTranscript(projectsDir, sessionId);
    remove(conversationId);
  }

  return {
    getSessionId(conversationId) {
      return read()[conversationId];
    },
    setSessionId(conversationId, sessionId) {
      const map = read();
      if (map[conversationId] === sessionId) return;
      map[conversationId] = sessionId;
      write(map);
    },
    remove,
    purge,
    resolveResume(conversationId) {
      const sessionId = read()[conversationId];
      if (!sessionId) return undefined;
      const located = locateTranscript(projectsDir, sessionId);
      if (!located) {
        console.warn(
          `[claude] transcript for conversation ${conversationId} (session ${sessionId}) is missing; starting a fresh session`,
        );
        remove(conversationId);
        return undefined;
      }
      if (currentSlugDir && dirname(located) !== currentSlugDir) {
        try {
          mkdirSync(currentSlugDir, { recursive: true });
          renameSync(located, join(currentSlugDir, `${sessionId}.jsonl`));
          console.warn(
            `[claude] relocated transcript for conversation ${conversationId} (session ${sessionId}) to the current workspace slug`,
          );
        } catch (err) {
          console.warn(
            `[claude] could not relocate transcript for conversation ${conversationId} (session ${sessionId}); starting a fresh session`,
            err,
          );
          remove(conversationId);
          return undefined;
        }
      }
      let clearedTokens = 0;
      if (cwd) {
        try {
          clearedTokens = clearStaleTranscriptResults(
            currentSlugDir
              ? join(currentSlugDir, `${sessionId}.jsonl`)
              : located,
            { workspaceDir: cwd, conversationId },
          );
        } catch (err) {
          console.error(
            `[claude] could not clear stale tool results for conversation ${conversationId}; resuming with them:`,
            err,
          );
        }
      }
      return { sessionId, clearedTokens };
    },
  };
}
