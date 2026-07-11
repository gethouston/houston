import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export interface McpOAuthState {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  pending?: { state: string; startedAtMs: number };
}

export interface McpAuthStore {
  read(id: string): Promise<McpOAuthState>;
  write(id: string, state: McpOAuthState): Promise<void>;
}

export class FileMcpAuthStore implements McpAuthStore {
  private readonly authDir: string;

  constructor(dir: string) {
    this.authDir = join(dir, "mcp-oauth");
  }

  private path(id: string): string {
    return join(this.authDir, `${encodeURIComponent(id)}.json`);
  }

  async read(id: string): Promise<McpOAuthState> {
    try {
      const parsed = JSON.parse(await readFile(this.path(id), "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      const missing =
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT";
      // Missing and corrupt state both mean signed out. Permission and I/O
      // failures still surface; treating those as logout would be silent data loss.
      if (missing || error instanceof SyntaxError) return {};
      throw error;
    }
  }

  async write(id: string, state: McpOAuthState): Promise<void> {
    await mkdir(this.authDir, { recursive: true, mode: 0o700 });
    const destination = this.path(id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, destination);
    // rename preserves an old destination's mode on some platforms only by
    // replacement semantics; chmod makes the credential invariant explicit.
    await chmod(destination, 0o600);
  }
}

export class MemoryMcpAuthStore implements McpAuthStore {
  private readonly states = new Map<string, McpOAuthState>();

  constructor(initial: Record<string, McpOAuthState> = {}) {
    for (const [id, state] of Object.entries(initial)) {
      this.states.set(id, structuredClone(state));
    }
  }

  async read(id: string): Promise<McpOAuthState> {
    return structuredClone(this.states.get(id) ?? {});
  }

  async write(id: string, state: McpOAuthState): Promise<void> {
    this.states.set(id, structuredClone(state));
  }
}
