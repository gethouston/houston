import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("workspace shell top safe area", () => {
  const shell = read("../src/components/shell/workspace-shell.tsx");

  it("pads the full-height frame with the top inset", () => {
    const frame = shell.match(/<div className="([^"]*\bh-dvh\b[^"]*)"/);
    ok(frame, "the shell has an h-dvh frame");
    ok(frame[1].split(" ").includes("pt-safe"), "the frame clears the bar");
  });

  it("leaves the screens' own headers without a second inset", () => {
    for (const rel of [
      "../src/components/shell/mobile-drilled-header.tsx",
      "../src/components/shell/shell-panel-card.tsx",
      "../src/components/mission-chat/mission-chat-screen.tsx",
      "../src/components/assistant/assistant-chat.tsx",
    ]) {
      ok(!read(rel).includes("pt-safe"), `${rel} would double the inset`);
    }
  });
});
