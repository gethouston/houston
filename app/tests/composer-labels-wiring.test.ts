import { ok } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("composer labels reach every composer", () => {
  it("each ChatPanel / ChatInput mount passes composer labels", () => {
    for (const file of sources(SRC)) {
      const src = readFileSync(file, "utf8");
      if (!/<(ChatPanel|ChatInput)\b/.test(src)) continue;
      ok(src.includes("composerLabels"), `${file}: no composer labels`);
    }
  });

  it("each AIBoard chat wiring hook passes composer labels", () => {
    for (const hook of [
      "components/board/use-board-chat-wiring.tsx",
      "components/board/use-archived-chat-props.tsx",
      "components/assistant/assistant-chat.tsx",
      "components/agent/routine-setup-chat-board.tsx",
    ]) {
      const src = readFileSync(path.join(SRC, hook), "utf8");
      ok(/composerLabels[,\n}=]/.test(src), `${hook}: no composer labels`);
    }
  });
});
