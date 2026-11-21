import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

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
    } catch {}
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
    const markers = ["CLAUDE_CODE_TRANSCRIPT_LOCAL_GC", "setLocalGcEnabled"];
    expect(await binaryContains(binary ?? "", markers)).toEqual(markers);
  },
  60_000,
);
