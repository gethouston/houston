import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The phone has ONE task list per employee, the AI Employees drill-in
// (`agents-home/agent-missions-screen.tsx`). The board never grows a phone
// form of its own again.

const src = (path: string) =>
  new URL(`../src/components/${path}`, import.meta.url);

describe("the phone's one task list", () => {
  it("is not the board's: the board has no phone fork", () => {
    ok(
      !readFileSync(src("board/mission-board.tsx"), "utf8").includes(
        "useIsMobile",
      ),
    );
  });

  it("opens every task, archived ones included, as the pushed chat", () => {
    const screen = readFileSync(
      src("agents-home/agent-missions-screen.tsx"),
      "utf8",
    );
    ok(!screen.includes("openAgentBoard"));
    ok(screen.includes("useDrillInMissionTarget(agent, conversations)"));
    const chat = readFileSync(
      src("mission-chat/mission-chat-screen.tsx"),
      "utf8",
    );
    ok(chat.includes("<ArchivedMissionChat"));
  });
});
