import { rmSync } from "node:fs";
import {
  discardKeychainCredential,
  readKeychainCredential,
} from "./anthropic-cli-keychain";
import {
  type CliMintedOauth,
  parseMintedCredential,
  readMintedFile,
} from "./anthropic-cli-output";

export type MintedCredentialDeps = {
  readCredentialFile?: (dir: string) => string | null;
  readKeychain?: (dir: string) => Promise<string | null>;
  cleanupDir?: (dir: string) => void;
  discardKeychain?: (dir: string) => Promise<void>;
};

export async function readMintedCredential(
  dir: string,
  deps: MintedCredentialDeps,
): Promise<CliMintedOauth> {
  const raw = (deps.readCredentialFile ?? readMintedFile)(dir);
  let fileProblem: Error | null = null;
  if (raw !== null) {
    try {
      return parseMintedCredential(raw);
    } catch (e) {
      fileProblem = e as Error;
    }
  }
  const fromKeychain = await (deps.readKeychain ?? readKeychainCredential)(dir);
  if (fromKeychain !== null) return parseMintedCredential(fromKeychain);
  if (fileProblem) throw fileProblem;
  throw new Error(
    "Claude sign-in finished but no credential was stored — the CLI wrote " +
      "neither a credential file nor a Keychain item Houston can read here; " +
      "paste an API token instead",
  );
}

export async function discardMintedCredential(
  dir: string,
  deps: MintedCredentialDeps,
): Promise<void> {
  try {
    (deps.cleanupDir ?? ((d) => rmSync(d, { recursive: true, force: true })))(
      dir,
    );
  } catch (e) {
    console.error("[oauth:anthropic] could not remove the login dir:", e);
  }
  try {
    await (deps.discardKeychain ?? discardKeychainCredential)(dir);
  } catch (e) {
    console.error(
      "[oauth:anthropic] could not remove the login's Keychain item:",
      e,
    );
  }
}
