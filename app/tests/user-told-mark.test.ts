import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { markToldUser, wasToldUser } from "../src/lib/user-told-mark.ts";

describe("user-told mark", () => {
  it("marks an error object and reads it back", () => {
    const err = new Error("last owner");
    strictEqual(wasToldUser(err), false);
    markToldUser(err);
    strictEqual(wasToldUser(err), true);
  });

  it("ignores values that cannot carry it", () => {
    markToldUser("boom");
    markToldUser(null);
    const frozen = Object.freeze(new Error("x"));
    markToldUser(frozen);
    strictEqual(wasToldUser("boom"), false);
    strictEqual(wasToldUser(null), false);
    strictEqual(wasToldUser(frozen), false);
  });

  it("call() stamps it only when its ladder told the user", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../src/lib/tauri.ts"),
      "utf8",
    );
    ok(
      src.includes(
        "if (await surfaceError(label, err, context, options)) markToldUser(err);",
      ),
    );
    const ladder = src.slice(
      src.indexOf("async function surfaceError("),
      src.indexOf("// ─── Workspaces"),
    );
    ok(ladder.includes("if (options?.silence?.(err)) return false;"));
    ok(
      ladder.includes(
        "showConnectivityErrorToast(label, message, err);\n    return true;",
      ),
    );
    ok(ladder.trimEnd().endsWith("return false;\n}"));
  });

  it("call() also counts what showErrorToast surfaced or withheld as told", () => {
    const read = (file: string) =>
      readFileSync(join(import.meta.dirname, `../src/lib/${file}`), "utf8");
    const tauri = read("tauri.ts");
    ok(tauri.includes("return showErrorToast(label, message, err);"));
    const toast = read("error-toast.ts");
    const body = toast.slice(toast.indexOf("export function showErrorToast("));
    ok(body.includes("): boolean {"));
    for (const line of [
      "suppressed: signed-out engine call`);\n    return true;",
      "while the agent warms up`);\n    return true;",
      "showConnectivityErrorToast(command, message, originalError);\n    return true;",
      "showEngineWakingToast(command, message, originalError);\n    return true;",
      "surfaceQuietState(quiet, command, message, originalError))\n    return true;",
    ]) {
      ok(body.includes(line), line);
    }
    ok(body.trimEnd().endsWith("return false;\n}"));
  });
});
