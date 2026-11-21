import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const machine = readFileSync(
  join(import.meta.dirname, "../src/hooks/use-update-machine.ts"),
  "utf8",
);
const checker = readFileSync(
  join(import.meta.dirname, "../src/hooks/use-update-checker.ts"),
  "utf8",
);

describe("useUpdateMachine download trigger", () => {
  it("hands the latch decision the trigger it was called with", () => {
    ok(machine.includes("async (trigger: DownloadTrigger): Promise<boolean>"));
    ok(
      /shouldSkipDownload\(\s*gaveUpRef\.current,\s*info\.version,\s*trigger,?\s*\)/.test(
        machine,
      ),
    );
  });

  it("passes the install source through, so a user retry is never latched", () => {
    const install = machine.slice(machine.indexOf("const installAndRelaunch"));
    ok(/await download\(source\)/.test(install));
    ok(!/download\(\)/.test(machine), "no trigger-less download call");
  });

  it("keeps the checker's automatic download on the poll trigger", () => {
    ok(checker.includes('void download("poll")'));
  });

  it("latches only on give_up, before the once-per-version report", () => {
    const giveUp = machine.indexOf(
      'if (outcome === "give_up") gaveUpRef.current = info.version;',
    );
    const report = machine.indexOf(
      "reportUpdateDownloadFailure(info.version, error)",
    );
    ok(giveUp !== -1 && report !== -1 && giveUp < report);
  });
});
