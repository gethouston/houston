import { describe, expect, it } from "vitest";
import { ClaudeBackendUnavailableError } from "./backend";
import {
  isBunCompiled,
  looksLikePlaceholder,
  resolveClaudeExecutable,
} from "./binary-path";

// The leading bytes of a real native `claude` image (Mach-O magic here) — never
// a shebang or a batch marker, so it must NOT read as a placeholder.
const MACHO_MAGIC = "\xcf\xfa\xed\xfe\x0c\x00\x00\x01";
// The two placeholder stubs build.rs stages when the real binary is absent.
const POSIX_PLACEHOLDER =
  "#!/bin/sh\necho 'placeholder external bin' >&2\nexit 1\n";
const WINDOWS_PLACEHOLDER = "@echo off\r\nexit /b 1\r\n";

describe("isBunCompiled", () => {
  it("is false for a normal Node file:// module url", () => {
    expect(isBunCompiled("file:///app/packages/runtime/src/main.ts")).toBe(
      false,
    );
  });

  it("is true inside Bun's $bunfs (POSIX single-file exe)", () => {
    expect(isBunCompiled("file:///$bunfs/root/binary-path.ts")).toBe(true);
  });

  it("is true inside Bun's ~BUN root (Windows single-file exe)", () => {
    expect(isBunCompiled("file:///B:/~BUN/root/binary-path.ts")).toBe(true);
  });
});

describe("resolveClaudeExecutable", () => {
  it("returns undefined on the Node path (SDK self-resolves)", () => {
    // No override → the SDK's own require.resolve of the platform subpackage
    // must not be pre-empted.
    expect(
      resolveClaudeExecutable({
        moduleUrl: "file:///app/packages/runtime/src/backends/claude/x.ts",
        execPath: "/usr/bin/node",
        platform: "linux",
        exists: () => true,
      }),
    ).toBeUndefined();
  });

  it("resolves the sibling `claude` next to the sidecar under Bun-compiled", () => {
    const seen: string[] = [];
    const path = resolveClaudeExecutable({
      moduleUrl: "file:///$bunfs/root/backends/claude/binary-path.ts",
      execPath: "/Applications/Houston.app/Contents/MacOS/houston-engine",
      platform: "darwin",
      exists: (p) => {
        seen.push(p);
        return true;
      },
      readHead: () => MACHO_MAGIC, // a real binary
    });
    expect(path).toBe("/Applications/Houston.app/Contents/MacOS/claude");
    expect(seen).toEqual(["/Applications/Houston.app/Contents/MacOS/claude"]);
  });

  it("uses claude.exe on win32", () => {
    const path = resolveClaudeExecutable({
      moduleUrl: "file:///B:/~BUN/root/binary-path.ts",
      execPath: "C:\\Program Files\\Houston\\houston-engine.exe",
      platform: "win32",
      exists: () => true,
      readHead: () => MACHO_MAGIC,
    });
    expect(path?.endsWith("claude.exe")).toBe(true);
  });

  it("throws a typed ClaudeBackendUnavailableError when the sibling is missing", () => {
    expect(() =>
      resolveClaudeExecutable({
        moduleUrl: "file:///$bunfs/root/binary-path.ts",
        execPath: "/Applications/Houston.app/Contents/MacOS/houston-engine",
        platform: "darwin",
        exists: () => false,
      }),
    ).toThrow(ClaudeBackendUnavailableError);
  });

  it("throws when the sibling is a POSIX placeholder stub (would hang the turn)", () => {
    // A present-but-placeholder `claude` is the silent-hang bug: the SDK would
    // spawn it and (historically) sleep forever. Refuse it → loud typed error.
    expect(() =>
      resolveClaudeExecutable({
        moduleUrl: "file:///$bunfs/root/binary-path.ts",
        execPath: "/Applications/Houston.app/Contents/MacOS/houston-engine",
        platform: "darwin",
        exists: () => true,
        readHead: () => POSIX_PLACEHOLDER,
      }),
    ).toThrow(ClaudeBackendUnavailableError);
  });

  it("throws when the sibling is a Windows batch placeholder", () => {
    expect(() =>
      resolveClaudeExecutable({
        moduleUrl: "file:///B:/~BUN/root/binary-path.ts",
        execPath: "C:\\Program Files\\Houston\\houston-engine.exe",
        platform: "win32",
        exists: () => true,
        readHead: () => WINDOWS_PLACEHOLDER,
      }),
    ).toThrow(ClaudeBackendUnavailableError);
  });
});

describe("looksLikePlaceholder", () => {
  it("flags a POSIX shebang stub", () => {
    expect(looksLikePlaceholder("/x/claude", () => POSIX_PLACEHOLDER)).toBe(
      true,
    );
  });

  it("flags a Windows batch stub", () => {
    expect(looksLikePlaceholder("/x/claude", () => WINDOWS_PLACEHOLDER)).toBe(
      true,
    );
  });

  it("passes a real native binary (magic bytes)", () => {
    expect(looksLikePlaceholder("/x/claude", () => MACHO_MAGIC)).toBe(false);
  });

  it("treats an unreadable file as non-placeholder (a spawn error is loud enough)", () => {
    expect(
      looksLikePlaceholder("/x/claude", () => {
        throw new Error("ENOENT");
      }),
    ).toBe(false);
  });
});
