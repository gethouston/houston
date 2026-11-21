import { mkdirSync } from "node:fs";
import { claudeLoginConfigDir } from "../backends/claude/paths";
import {
  anthropicServedHere,
  serveModeOn,
  syncServedCredentialSafe,
} from "./serve";
export async function anthropicSharedLoginDir(): Promise<string | null> {
  if (!serveModeOn()) return null;
  if (anthropicServedHere() === undefined)
    await syncServedCredentialSafe("anthropic-login");
  if (anthropicServedHere() !== false) return null;
  const dir = claudeLoginConfigDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
