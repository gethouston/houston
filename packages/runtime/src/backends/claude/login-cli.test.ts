import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { extractVisitUrl, readMintedCredential, stripOsc8 } from "./login-cli";

const ESC = "\u001b";
const BEL = "\u0007";
const OSC_OPEN = `${ESC}]8;;https://claude.com/cai/oauth/authorize${BEL}`;
const OSC_CLOSE = `${ESC}]8;;${BEL}`;

test("extractVisitUrl finds the bare authorize URL after the marker", () => {
  expect(
    extractVisitUrl(
      "Please visit: https://claude.com/cai/oauth/authorize?code=true&state=abc",
    ),
  ).toBe("https://claude.com/cai/oauth/authorize?code=true&state=abc");
});

test("extractVisitUrl strips OSC-8 hyperlink wrapping (CLI ≥2.1.201)", () => {
  const line = `visit: ${OSC_OPEN}https://claude.com/cai/oauth/authorize?state=x${OSC_CLOSE}`;
  expect(extractVisitUrl(line)).toBe(
    "https://claude.com/cai/oauth/authorize?state=x",
  );
});

test("extractVisitUrl trims trailing sentence punctuation", () => {
  expect(extractVisitUrl("visit: https://claude.com/a).")).toBe(
    "https://claude.com/a",
  );
});

test("extractVisitUrl rejects non-http tokens and markerless lines", () => {
  expect(extractVisitUrl("visit: file:///etc/passwd")).toBeNull();
  expect(extractVisitUrl("visit:")).toBeNull();
  expect(extractVisitUrl("no marker here https://claude.com")).toBeNull();
});

test("stripOsc8 leaves plain lines untouched", () => {
  const line = "visit: https://claude.com/x now";
  expect(stripOsc8(line)).toBe(line);
});

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function mintDirWith(contents?: string): string {
  dir = mkdtempSync(join(tmpdir(), "login-cli-test-"));
  if (contents !== undefined)
    writeFileSync(join(dir, ".credentials.json"), contents);
  return dir;
}

test("readMintedCredential parses the CLI envelope", () => {
  const d = mintDirWith(
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-a",
        refreshToken: "r",
        expiresAt: 42,
        subscriptionType: "max",
      },
    }),
  );
  expect(readMintedCredential(d)).toMatchObject({
    accessToken: "sk-ant-oat01-a",
    refreshToken: "r",
    expiresAt: 42,
  });
});

test("readMintedCredential throws user-fit errors for absent/garbled files", () => {
  expect(() => readMintedCredential(mintDirWith())).toThrow(
    /left no credential/,
  );
  expect(() => readMintedCredential(mintDirWith("not json"))).toThrow(
    /could not be read/,
  );
  expect(() =>
    readMintedCredential(mintDirWith(JSON.stringify({ claudeAiOauth: {} }))),
  ).toThrow(/malformed/);
});
