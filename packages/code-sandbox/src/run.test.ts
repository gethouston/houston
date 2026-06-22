import { describe, expect, test } from "bun:test";
import type { Language } from "./run";
import { DEFAULT_LIMITS, runInSandbox, safeJoin } from "./run";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const fromB64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

describe("safeJoin", () => {
  test("rejects traversal and absolute paths", () => {
    expect(() => safeJoin("/work", "../etc/passwd")).toThrow(/escapes/);
    expect(() => safeJoin("/work", "/etc/passwd")).toThrow(/escapes/);
    expect(safeJoin("/work", "a/b.txt")).toBe("/work/a/b.txt");
  });
});

describe("runInSandbox", () => {
  test("python: captures stdout, exit 0, no artifacts", async () => {
    const r = await runInSandbox({
      language: "python",
      code: "print('hello houston')",
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("hello houston");
    expect(r.artifacts).toHaveLength(0);
    expect(r.timedOut).toBe(false);
  });

  test("python: a written file comes back as an artifact", async () => {
    const r = await runInSandbox({
      language: "python",
      code: "open('deck.txt','w').write('slide 1')",
    });
    expect(r.exitCode).toBe(0);
    const deck = r.artifacts.find((a) => a.path === "deck.txt");
    expect(deck).toBeDefined();
    if (!deck) throw new Error("deck.txt artifact missing");
    expect(fromB64(deck.contentBase64)).toBe("slide 1");
  });

  test("input file is readable and not echoed back unchanged", async () => {
    const r = await runInSandbox({
      language: "python",
      code: "print(open('in.txt').read().upper()); open('out.txt','w').write('done')",
      files: [{ path: "in.txt", contentBase64: b64("seed") }],
    });
    expect(r.stdout.trim()).toBe("SEED");
    expect(r.artifacts.map((a) => a.path)).toEqual(["out.txt"]); // in.txt unchanged → not returned
  });

  test("nonzero exit is reported, not thrown", async () => {
    const r = await runInSandbox({
      language: "python",
      code: "import sys; sys.exit(3)",
    });
    expect(r.exitCode).toBe(3);
  });

  test("timeout kills the process and flags timedOut", async () => {
    const r = await runInSandbox(
      {
        language: "python",
        code: "import time; time.sleep(10)",
        timeoutMs: 300,
      },
      DEFAULT_LIMITS,
    );
    expect(r.timedOut).toBe(true);
  });

  test("bash works", async () => {
    const r = await runInSandbox({
      language: "bash",
      code: "echo hi from bash",
    });
    expect(r.stdout.trim()).toBe("hi from bash");
  });

  test("unsupported language throws", async () => {
    await expect(
      runInSandbox({ language: "ruby" as unknown as Language, code: "puts 1" }),
    ).rejects.toThrow(/unsupported/);
  });

  test("input-file path traversal throws", async () => {
    await expect(
      runInSandbox({
        language: "bash",
        code: "true",
        files: [{ path: "../escape", contentBase64: b64("x") }],
      }),
    ).rejects.toThrow(/escapes/);
  });

  test("stdout is capped (truncated flag set)", async () => {
    const r = await runInSandbox(
      { language: "python", code: "print('x' * 1_000_000)" },
      { ...DEFAULT_LIMITS, maxOutputBytes: 1000 },
    );
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(1000);
  });

  test("artifact budget counts base64 size, not raw bytes", async () => {
    // 1000 raw bytes → ~1336 base64. Budget 1300 (base64 terms): raw "fits" but
    // encoded does not, so it must be excluded.
    const r = await runInSandbox(
      { language: "python", code: "open('big.bin','wb').write(b'x'*1000)" },
      { ...DEFAULT_LIMITS, maxArtifactBytes: 1300 },
    );
    expect(r.artifacts.find((a) => a.path === "big.bin")).toBeUndefined();
    // not silently dropped — surfaced for the caller/model.
    expect(r.droppedArtifacts).toContain("big.bin");
  });

  test("reaps grandchild processes on completion (process group killed)", async () => {
    // Non-interactive bash runs `&` jobs in its own process group, so killing the
    // group must take out the orphaned `sleep`.
    const r = await runInSandbox({
      language: "bash",
      code: "sleep 30 & echo $!",
    });
    const pid = Number(r.stdout.trim().split(/\s+/)[0]);
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    await new Promise((res) => setTimeout(res, 250));
    let alive = true;
    try {
      process.kill(pid, 0); // signal 0 = existence check
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });
});
