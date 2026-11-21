import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCli } from "./anthropic-cli-binary";
import {
  discardMintedCredential,
  type MintedCredentialDeps,
  readMintedCredential,
} from "./anthropic-cli-credential";
import type {
  AnthropicLoginCallbacks,
  CliMintedOauth,
  LoginChild,
} from "./anthropic-cli-output";
import {
  CliUnavailableError,
  extractVisitUrl,
  scrubTokens,
  wireLines,
} from "./anthropic-cli-output";
import {
  isAnthropicToken,
  runAnthropicSetupTokenLogin,
  storeAnthropicToken,
} from "./anthropic-setup-token";

export type AnthropicLoginDeps = MintedCredentialDeps & {
  binary: string | null;
  storeToken: (key: string) => void;
  storeOauth: (cred: CliMintedOauth) => void;
  sharedLoginDir?: string | null;
  spawnChild?: (binary: string, configDir: string) => LoginChild;
  mkLoginDir?: () => string;
};

export async function runAnthropicLogin(
  cb: AnthropicLoginCallbacks,
  deps: AnthropicLoginDeps,
): Promise<void> {
  if (deps.binary) {
    try {
      console.log(
        `[oauth:anthropic] Claude CLI subscription login via ${deps.binary}`,
      );
      await runAnthropicCliLogin(cb, deps, deps.binary);
      return;
    } catch (e) {
      if (!(e instanceof CliUnavailableError)) throw e;
      console.warn(
        "[oauth:anthropic] Claude CLI login cannot start here — falling back to the token paste flow:",
        e.message,
      );
    }
  }
  await runAnthropicSetupTokenLogin(cb, { store: deps.storeToken });
}

async function runAnthropicCliLogin(
  cb: AnthropicLoginCallbacks,
  deps: AnthropicLoginDeps,
  binary: string,
): Promise<void> {
  const shared = deps.sharedLoginDir ?? null;
  const dir =
    shared ??
    (
      deps.mkLoginDir ??
      (() => mkdtempSync(join(tmpdir(), "houston-claude-login-")))
    )();
  const child = (deps.spawnChild ?? spawnCli)(binary, dir);
  try {
    await driveCliLogin(child, cb, deps, dir);
  } finally {
    try {
      child.kill();
    } catch {}
    if (!shared) await discardMintedCredential(dir, deps);
  }
}

async function driveCliLogin(
  child: LoginChild,
  cb: AnthropicLoginCallbacks,
  deps: AnthropicLoginDeps,
  dir: string,
): Promise<void> {
  const tail: string[] = [];
  let url: string | null = null;
  let urlFoundResolve!: () => void;
  const urlFound = new Promise<void>((r) => {
    urlFoundResolve = r;
  });
  const onLine = (line: string) => {
    const t = line.trim();
    if (t) tail.push(t);
    if (tail.length > 12) tail.shift();
    if (url) return;
    const u = extractVisitUrl(line);
    if (u) {
      url = u;
      urlFoundResolve();
    }
  };
  wireLines(child.stdout, onLine);
  wireLines(child.stderr, onLine);
  const exit = new Promise<number>((resolve, reject) => {
    child.once("exit", (code, signal) => resolve(code ?? (signal ? -1 : 0)));
    child.once("error", (e) =>
      reject(
        new CliUnavailableError(`could not spawn the Claude CLI: ${e.message}`),
      ),
    );
  });

  await Promise.race([
    urlFound,
    exit.then((code) => {
      throw new CliUnavailableError(
        `the Claude CLI exited (${code}) before the sign-in URL: ${scrubTokens(tail.join(" | "))}`,
      );
    }),
  ]);
  if (!url) throw new Error("unreachable: URL race settled without a URL");
  cb.onAuth({ url });

  const outcome = await Promise.race([
    cb.onManualCodeInput().then((value) => ({ kind: "input" as const, value })),
    exit.then((code) => ({ kind: "exit" as const, code })),
  ]);
  if (outcome.kind === "input") {
    const pasted = outcome.value.trim();
    if (isAnthropicToken(pasted)) {
      storeAnthropicToken(pasted, deps.storeToken);
      return;
    }
    child.stdin.write(`${pasted}\n`);
  }
  const code = outcome.kind === "exit" ? outcome.code : await exit;
  if (code !== 0)
    throw new Error(
      `Claude sign-in failed (exit ${code}): ${scrubTokens(tail.join(" | "))}`,
    );

  const minted = await readMintedCredential(dir, deps);
  if (!deps.sharedLoginDir) deps.storeOauth(minted);
}
