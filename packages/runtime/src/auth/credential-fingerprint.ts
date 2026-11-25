import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { endpointFileIn, OPENAI_COMPATIBLE } from "../ai/openai-compatible";
import { claudeCredentialsFile } from "../backends/claude/paths";
import { config } from "../config";
import {
  currentActingContext,
  currentCredentialScope,
  isPersonalScope,
} from "../session/acting-context";
import { authPathIn, readAuthFile } from "./auth-file";

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileFingerprint(path: string): string {
  try {
    return digest(readFileSync(path));
  } catch {
    return "absent";
  }
}

// WHY: Reads files, not storage.ts, to avoid an init cycle; shared Claude file counts in team scope only. ADR-0008
export function credentialFingerprint(id: string): string {
  const { key } = currentCredentialScope();
  const activeAuthPath = currentActingContext()?.authPath;
  const dataDir = activeAuthPath ? dirname(activeAuthPath) : config.dataDir;
  const cred = readAuthFile(activeAuthPath ?? authPathIn(dataDir, key))[id];
  const stored = cred ? digest(JSON.stringify(cred)) : "absent";
  if (id === "anthropic" && !isPersonalScope(key))
    return `${stored}|${fileFingerprint(claudeCredentialsFile())}`;
  if (id === OPENAI_COMPATIBLE)
    return `${stored}|${fileFingerprint(endpointFileIn(dataDir))}`;
  return stored;
}
