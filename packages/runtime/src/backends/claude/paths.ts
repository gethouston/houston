import { homedir } from "node:os";
import { join } from "node:path";
import { anthropicCredentialStorageDir } from "./scope-guard";

export function houstonHome(): string {
  return process.env.HOUSTON_HOME || join(homedir(), ".houston-ts");
}

export function claudeLoginConfigDir(home: string = houstonHome()): string {
  return join(home, "claude-login");
}

export function claudeCredentialsFile(
  configDir: string = claudeLoginConfigDir(),
): string {
  return join(configDir, ".credentials.json");
}

export function claudeProjectsDir(): string {
  return join(claudeLoginConfigDir(), "projects");
}

export function claudeBaseDir(dataDir: string): string {
  return join(dataDir, "backends", "claude");
}

export function claudeSessionsFile(dataDir: string): string {
  return join(claudeBaseDir(dataDir), "sessions.json");
}

export interface ClaudeLayout {
  configDir: string;
  sessionsFile: string;
  credentialStorageDir?: string;
  homeDir?: string;
}

export function serverClaudeLayout(dataDir: string): ClaudeLayout {
  return {
    configDir: claudeLoginConfigDir(),
    sessionsFile: claudeSessionsFile(dataDir),
    get credentialStorageDir() {
      return anthropicCredentialStorageDir(dataDir);
    },
  };
}
