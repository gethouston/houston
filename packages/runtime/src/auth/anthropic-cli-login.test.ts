import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, test } from "vitest";
import {
  type AnthropicLoginDeps,
  runAnthropicLogin,
} from "./anthropic-cli-login";
import {
  extractVisitUrl,
  parseMintedCredential,
  scrubTokens,
  stripOsc8,
} from "./anthropic-cli-output";
import {
  ANTHROPIC_TOKEN_HELP_URL,
  type SetupTokenCallbacks,
} from "./anthropic-setup-token";

const AUTHORIZE_URL =
  "https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=xyz";

/** A minted-credential file body shaped like the CLI writes it. */
const MINTED = JSON.stringify({
  claudeAiOauth: {
    accessToken: "sk-ant-oat01-access",
    refreshToken: "sk-ant-ort01-refresh",
    expiresAt: 1755555555555,
    scopes: ["user:inference"],
  },
});

/** The spawned-child seam: scripted stdout/stderr, captured stdin, exit/error. */
class FakeChild {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdinWrites: string[] = [];
  stdin = { write: (chunk: string) => void this.stdinWrites.push(chunk) };
  killed = false;
  private emitter = new EventEmitter();
  once(event: "exit" | "error", cb: (...args: never[]) => void): void {
    this.emitter.once(event, cb as (...args: unknown[]) => void);
  }
  kill(): void {
    this.killed = true;
  }
  exit(code: number): void {
    this.emitter.emit("exit", code, null);
  }
  spawnError(message: string): void {
    this.emitter.emit("error", new Error(message));
  }
}

/** Let stream data / promise races settle between scripted steps. */
const tick = () => new Promise((r) => setImmediate(r));

type Harness = {
  child: FakeChild;
  authInfos: Array<{ url: string; instructions?: string }>;
  stored: { tokens: string[]; oauth: Array<Record<string, unknown>> };
  cleaned: string[];
  login: Promise<void>;
  paste: (value: string) => void;
};

/** Drive runAnthropicLogin against a FakeChild with injected fs seams. */
function harness(opts?: {
  binary?: string | null;
  credentialFile?: string | null;
  pasteNever?: boolean;
}): Harness {
  const child = new FakeChild();
  const authInfos: Harness["authInfos"] = [];
  const stored: Harness["stored"] = { tokens: [], oauth: [] };
  const cleaned: string[] = [];
  let paste!: (value: string) => void;
  const pastePromise = new Promise<string>((r) => {
    paste = r;
  });
  const cb: SetupTokenCallbacks = {
    onAuth: (info) => void authInfos.push(info),
    onManualCodeInput: () =>
      opts?.pasteNever ? new Promise<string>(() => {}) : pastePromise,
  };
  const deps: AnthropicLoginDeps = {
    binary: opts?.binary === undefined ? "/bundle/claude" : opts.binary,
    storeToken: (key) => void stored.tokens.push(key),
    storeOauth: (cred) => void stored.oauth.push({ ...cred }),
    spawnChild: () => child,
    mkLoginDir: () => "/tmp/fake-login-dir",
    cleanupDir: (dir) => void cleaned.push(dir),
    readCredentialFile: () =>
      opts?.credentialFile === undefined ? MINTED : opts.credentialFile,
  };
  return {
    child,
    authInfos,
    stored,
    cleaned,
    paste,
    login: runAnthropicLogin(cb, deps),
  };
}

test("CLI login: URL surfaced, code relayed to stdin, minted oauth stored", async () => {
  const h = harness();
  // Real CLI shape: the URL is OSC-8 hyperlink-wrapped even on a pipe.
  h.child.stdout.write("Opening browser to sign in…\n");
  h.child.stdout.write(
    `If the browser didn't open, visit: \u001b]8;;${AUTHORIZE_URL}\u0007${AUTHORIZE_URL}\u001b]8;;\u0007\n`,
  );
  await tick();
  expect(h.authInfos).toEqual([{ url: AUTHORIZE_URL }]); // no instructions → open-URL + paste-code rendering
  h.paste("the-verification-code");
  await tick();
  expect(h.child.stdinWrites).toEqual(["the-verification-code\n"]);
  h.child.exit(0);
  await h.login;
  expect(h.stored.oauth).toEqual([
    {
      access: "sk-ant-oat01-access",
      refresh: "sk-ant-ort01-refresh",
      expires: 1755555555555,
    },
  ]);
  expect(h.stored.tokens).toEqual([]);
  expect(h.cleaned).toEqual(["/tmp/fake-login-dir"]); // the refresh-bearing dir never lingers
  expect(h.child.killed).toBe(true);
});

test("CLI login: a co-located listener settles the flow with no code", async () => {
  const h = harness({ pasteNever: true });
  h.child.stdout.write(`visit: ${AUTHORIZE_URL}\n`);
  await tick();
  h.child.exit(0);
  await h.login;
  expect(h.child.stdinWrites).toEqual([]);
  expect(h.stored.oauth).toHaveLength(1);
});

test("CLI login: a pasted sk-ant token takes the token flow instead", async () => {
  const h = harness();
  h.child.stdout.write(`visit: ${AUTHORIZE_URL}\n`);
  await tick();
  h.paste("sk-ant-oat01-pasted-by-a-power-user");
  await h.login;
  expect(h.stored.tokens).toEqual(["sk-ant-oat01-pasted-by-a-power-user"]);
  expect(h.stored.oauth).toEqual([]);
  expect(h.child.killed).toBe(true);
});

test("CLI login: nonzero exit after the code fails loud, tokens scrubbed", async () => {
  const h = harness();
  h.child.stdout.write(`visit: ${AUTHORIZE_URL}\n`);
  await tick();
  h.paste("bad-code");
  await tick();
  h.child.stderr.write("token sk-ant-oat01-leaky rejected\n");
  h.child.exit(1);
  await expect(h.login).rejects.toThrow(/exit 1/);
  await expect(h.login).rejects.not.toThrow(/sk-ant-oat01-leaky/);
  expect(h.stored.oauth).toEqual([]);
});

test("CLI login: exit 0 without a readable credential file fails loud", async () => {
  const h = harness({ credentialFile: null });
  h.child.stdout.write(`visit: ${AUTHORIZE_URL}\n`);
  await tick();
  h.paste("the-code");
  await tick();
  h.child.exit(0);
  await expect(h.login).rejects.toThrow(/no credential file/);
});

test("CLI death before the URL falls back to the token paste flow", async () => {
  const h = harness();
  h.child.stderr.write("SIGILL: illegal instruction\n");
  h.child.exit(132);
  await tick();
  // The fallback re-runs onAuth as the paste flow (help url + instructions).
  h.paste("sk-ant-api03-fallback-key");
  await h.login;
  expect(h.authInfos).toHaveLength(1);
  expect(h.authInfos[0]?.url).toBe(ANTHROPIC_TOKEN_HELP_URL);
  expect(h.authInfos[0]?.instructions).toBeTruthy();
  expect(h.stored.tokens).toEqual(["sk-ant-api03-fallback-key"]);
});

test("a spawn error falls back to the token paste flow", async () => {
  const h = harness();
  h.child.spawnError("spawn claude ENOENT");
  await tick();
  h.paste("sk-ant-oat01-tok");
  await h.login;
  expect(h.stored.tokens).toEqual(["sk-ant-oat01-tok"]);
});

test("no binary goes straight to the token paste flow", async () => {
  const h = harness({ binary: null });
  await tick();
  expect(h.authInfos[0]?.url).toBe(ANTHROPIC_TOKEN_HELP_URL);
  h.paste("sk-ant-oat01-tok");
  await h.login;
  expect(h.stored.tokens).toEqual(["sk-ant-oat01-tok"]);
});

test("extractVisitUrl parses plain, punctuated, and OSC-8 wrapped lines", () => {
  expect(
    extractVisitUrl(`If the browser didn't open, visit: ${AUTHORIZE_URL}`),
  ).toBe(AUTHORIZE_URL);
  expect(extractVisitUrl(`visit: ${AUTHORIZE_URL}.`)).toBe(AUTHORIZE_URL);
  expect(extractVisitUrl(`(visit: ${AUTHORIZE_URL})`)).toBe(AUTHORIZE_URL);
  const bel = `visit: \u001b]8;;${AUTHORIZE_URL}\u0007${AUTHORIZE_URL}\u001b]8;;\u0007`;
  expect(extractVisitUrl(bel)).toBe(AUTHORIZE_URL);
  const st = `visit: \u001b]8;;${AUTHORIZE_URL}\u001b\\${AUTHORIZE_URL}\u001b]8;;\u001b\\`;
  expect(extractVisitUrl(st)).toBe(AUTHORIZE_URL);
  // Unterminated OSC-8 tail: never surface raw escape bytes.
  expect(extractVisitUrl(`visit: \u001b]8;;${AUTHORIZE_URL}`)).toBeNull();
  expect(extractVisitUrl("Opening browser to sign in")).toBeNull();
  expect(extractVisitUrl("please visit: the docs")).toBeNull();
});

test("stripOsc8 leaves plain text alone", () => {
  expect(stripOsc8("plain visit: text")).toBe("plain visit: text");
});

test("scrubTokens redacts sk-ant material", () => {
  expect(scrubTokens("a sk-ant-oat01-secret-value b")).toBe("a sk-ant-… b");
});

test("parseMintedCredential maps the CLI file and rejects drifted shapes", () => {
  expect(parseMintedCredential(MINTED)).toEqual({
    access: "sk-ant-oat01-access",
    refresh: "sk-ant-ort01-refresh",
    expires: 1755555555555,
  });
  expect(() =>
    parseMintedCredential(
      JSON.stringify({ claudeAiOauth: { accessToken: "x" } }),
    ),
  ).toThrow(/unexpected shape/);
  expect(() => parseMintedCredential("{}")).toThrow(/unexpected shape/);
});
