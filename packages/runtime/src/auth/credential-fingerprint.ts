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

/**
 * What a provider's CURRENT credential material hashes to, for the acting
 * identity in scope. Split out of credential-health.ts (which OWNS the marks)
 * because it is the piece with the real IO: it reads the persisted credential
 * directly (auth-file.ts + the materialized Claude file) rather than going
 * through auth/storage.ts — that module reaches the Claude backend, which this
 * module's callers (the backends' error classifiers) sit underneath, and the
 * import cycle is not worth a cached view of the same bytes.
 */

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A file's content hash, or "absent" when it can't be read. */
function fileFingerprint(path: string): string {
  try {
    return digest(readFileSync(path));
  } catch {
    return "absent";
  }
}

/**
 * A stable fingerprint of a provider's CURRENT persisted credential material.
 * Two providers span more than their auth.json entry: anthropic also carries
 * the shared-dir credentials file (the Keychain is not observable from here —
 * its rotations heal via the clean-turn clear instead), and the local
 * OpenAI-compatible provider carries its endpoint config (same placeholder
 * key, different server = a different "credential": reconfiguring the
 * endpoint must heal a failure mark).
 *
 * Everything read here belongs to the CURRENT acting identity (HOU-976). The
 * shared-dir credentials file is the exception in reverse: it is team material,
 * so it only counts in the team scope — otherwise another member's credential
 * push would heal (or re-break) a member's own mark.
 */
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
