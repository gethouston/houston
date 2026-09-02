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

/**
 * Where the CLI login left its minted credential, and how to destroy every
 * copy afterwards (anthropic-cli-login.ts's post-exit half).
 *
 * Read order, scoped to the throwaway login dir: the credential file first
 * (Linux pods, Docker self-host, Windows, some macOS setups), then the macOS
 * Keychain item the CLI writes on darwin instead. A file that exists but holds
 * no usable credential (a logout husk) falls through to the Keychain; its
 * concrete problem is what surfaces when the Keychain is empty too.
 */

export type MintedCredentialDeps = {
  // Test seams; production reads the real dir / Keychain.
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

/**
 * Remove the login dir and the Keychain item. Both copies carry the refresh
 * token; a leftover would be a second-rotator seed, so a failure is loud —
 * but never fatal to a login that already stored its credential.
 */
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
