import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

// buildClaudeEnv sets CLAUDE_CODE_TRANSCRIPT_LOCAL_GC, a flag the CLI does not
// document. An SDK bump that drops it would leave the env var set and the
// session files growing again with nothing failing, so this reads the CLI
// binary the SDK spawns for turns. CI's ubuntu runner installs the linux-x64
// platform package with the rest of the optional dependencies.
function platformBinary(): string | undefined {
  const sdkMain = createRequire(import.meta.url).resolve(
    "@anthropic-ai/claude-agent-sdk",
  );
  const fromSdk = createRequire(sdkMain);
  const slug = `${process.platform}-${process.arch}`;
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  for (const pkg of [slug, `${slug}-musl`]) {
    try {
      const manifest = fromSdk.resolve(
        `@anthropic-ai/claude-agent-sdk-${pkg}/package.json`,
      );
      return join(dirname(manifest), name);
    } catch {
      // This platform's package is not installed; try the next libc.
    }
  }
  return undefined;
}

async function binaryContains(path: string, needles: string[]) {
  const wanted = needles.map((needle) => Buffer.from(needle));
  const overlap = Math.max(...wanted.map((needle) => needle.length)) - 1;
  const found = new Set<string>();
  let tail = Buffer.alloc(0);
  for await (const chunk of createReadStream(path)) {
    const window = Buffer.concat([tail, chunk as Buffer]);
    wanted.forEach((needle, i) => {
      if (window.includes(needle)) found.add(needles[i] ?? "");
    });
    tail = window.subarray(Math.max(0, window.length - overlap));
  }
  return needles.filter((needle) => found.has(needle));
}

const binary = platformBinary();

test.skipIf(binary === undefined)(
  "the installed Claude CLI still reads the transcript cleanup flag",
  async () => {
    // The env name alone also sits in the CLI's env registries, so the switch
    // it flips must still exist too.
    const markers = ["CLAUDE_CODE_TRANSCRIPT_LOCAL_GC", "setLocalGcEnabled"];
    expect(await binaryContains(binary ?? "", markers)).toEqual(markers);
  },
  60_000,
);
