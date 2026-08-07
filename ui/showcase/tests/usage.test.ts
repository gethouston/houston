import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// The generator is plain `.mjs` on purpose — no loader, no dependencies, it
// reads source as text — so the test can both run its CLI and import its parts.
import { SCAN_ROOTS } from "../scripts/gen-usage.mjs";
import { readSpecimens } from "../scripts/read-specimens.mjs";
import {
  importedSymbols,
  publicExports,
  relativeImports,
} from "../scripts/scan-imports.mjs";
import { surfaceOf } from "../scripts/surface-rules.mjs";
import { specimens } from "../src/registry.ts";

const SHOWCASE = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMITTED = join(SHOWCASE, "src/usage.gen.json");

const workspace = mkdtempSync(join(tmpdir(), "houston-showcase-usage-"));
after(() => rmSync(workspace, { recursive: true, force: true }));

describe("the Used in map", () => {
  it("matches a fresh run of the generator", () => {
    const fresh = join(workspace, "usage.gen.json");
    execFileSync(
      process.execPath,
      [join(SHOWCASE, "scripts/gen-usage.mjs"), `--out=${fresh}`],
      { stdio: "pipe" },
    );
    assert.equal(
      readFileSync(COMMITTED, "utf8"),
      readFileSync(fresh, "utf8"),
      "src/usage.gen.json is stale — run pnpm --filter @houston-ai/showcase gen:usage",
    );
  });

  it("keys only real specimens, with sorted surfaces and a truthful count", () => {
    const usage: Record<string, { surfaces: string[]; fileCount: number }> =
      JSON.parse(readFileSync(COMMITTED, "utf8"));
    const ids = new Set(specimens.map((one) => one.id));
    const keys = Object.keys(usage);
    assert.deepEqual(keys, [...keys].sort(), "ids are not sorted");
    for (const [id, entry] of Object.entries(usage)) {
      assert.ok(ids.has(id), `${id} is not a specimen`);
      assert.deepEqual(
        entry.surfaces,
        [...entry.surfaces].sort(),
        `${id}: surfaces are not sorted`,
      );
      assert.ok(entry.surfaces.length > 0, `${id} has an empty surface list`);
      assert.ok(
        entry.fileCount >= entry.surfaces.length,
        `${id}: ${entry.fileCount} files cannot cover ${entry.surfaces.length} surfaces`,
      );
    }
  });

  it("reads a `sources` list off exactly the pages the registry knows", () => {
    assert.deepEqual(
      readSpecimens()
        .map((one) => one.id)
        .sort(),
      specimens.map((one) => one.id).sort(),
      "the text reader and the registry disagree about which pages exist",
    );
  });
});

describe("the import scanner", () => {
  it("takes value imports and leaves type-only ones", () => {
    const found = importedSymbols(
      [
        'import { Button, Card as Panel } from "@houston-ai/core";',
        'import type { ModelPickerModel } from "@houston-ai/core";',
        'import { type Toast, ToastContainer } from "@houston-ai/core";',
        'import { useState } from "react";',
        'import { Board } from "./board";',
      ].join("\n"),
    );
    assert.deepEqual(
      [...found].sort(),
      ["Button", "Card", "ToastContainer"],
      "a type-only specifier or a non-@houston-ai import leaked in",
    );
  });

  it("reads a multi-line import clause", () => {
    const found = importedSymbols(
      'import {\n  Dialog,\n  DialogContent,\n} from "@houston-ai/core";\n',
    );
    assert.deepEqual([...found].sort(), ["Dialog", "DialogContent"]);
  });

  it("takes relative value imports and leaves package and type ones", () => {
    const found = relativeImports(
      [
        'import { KanbanBoard } from "./kanban-board";',
        'import { KanbanList } from "../kanban-list";',
        'import type { KanbanItem } from "./types";',
        'import { type KanbanCardLabels, KanbanCard } from "./kanban-card";',
        'import { Button } from "@houston-ai/core";',
        'import { useState } from "react";',
      ].join("\n"),
    );
    assert.deepEqual(
      [...found].sort(),
      ["KanbanBoard", "KanbanCard", "KanbanList"],
      "a type-only specifier or a package import leaked in",
    );
  });

  it("reads what a package index publishes, renames included", () => {
    const found = publicExports(
      [
        'export type { AIBoardProps } from "./ai-board";',
        'export { AIBoard } from "./ai-board";',
        'export {\n  CARD_PEOPLE_MAX,\n  initialsFor,\n} from "./kanban-people";',
        'export { internalName as KanbanList } from "./kanban-list";',
        'export { type ColumnDragRole, columnDragRole } from "./dnd";',
      ].join("\n"),
    );
    assert.deepEqual(
      [...found].sort(),
      [
        "AIBoard",
        "CARD_PEOPLE_MAX",
        "KanbanList",
        "columnDragRole",
        "initialsFor",
      ],
      "the published name is the one after `as`, and types are not values",
    );
  });
});

describe("intra-package composition", () => {
  const usage: Record<string, { surfaces: string[]; fileCount: number }> =
    JSON.parse(readFileSync(COMMITTED, "utf8"));

  // The bug this closed: `KanbanBoard` is rendered by `AIBoard`, its own
  // package's assembled screen, through a relative import — so a scanner that
  // only reads `@houston-ai/*` imports concluded that nothing uses the mission
  // board. It is used on every agent's Activity tab.
  it("credits a component composed inside its own package", () => {
    assert.deepEqual(usage["board-kanban-board"]?.surfaces, [
      "ui/board (internal)",
    ]);
  });

  it("labels internal usage by package, and only for ui packages", () => {
    const packages = new Set(
      (SCAN_ROOTS as readonly string[]).flatMap((root) => {
        const name = /^ui\/([^/]+)\/src$/.exec(root)?.[1];
        return name ? [`ui/${name} (internal)`] : [];
      }),
    );
    const seen = new Set(
      Object.values(usage)
        .flatMap((entry) => entry.surfaces)
        .filter((surface) => surface.endsWith("(internal)")),
    );
    assert.notEqual(seen.size, 0, "no internal usage was found at all");
    for (const surface of seen) {
      assert.ok(packages.has(surface), `${surface} is not a scanned package`);
    }
  });

  it("still shows a component used both internally and by a surface", () => {
    // Nothing is special-cased downstream: `UsedIn` renders whatever chips the
    // map holds, so a component with both kinds of usage lists both.
    const both = Object.values(usage).filter(
      (entry) =>
        entry.surfaces.some((surface) => surface.endsWith("(internal)")) &&
        entry.surfaces.some((surface) => !surface.endsWith("(internal)")),
    );
    assert.notEqual(both.length, 0, "no component carries both kinds of usage");
  });
});

describe("the surface rules", () => {
  it("names the app's own surfaces", () => {
    const cases: Record<string, string> = {
      "app/src/components/board/mission-board.tsx": "Activity",
      "app/src/components/chat-mode-selector.tsx": "Chat",
      "app/src/components/tabs/routines-tab.tsx": "Routines",
      "app/src/components/tabs/skill-card.tsx": "Skills",
      "app/src/components/tabs/files-tab.tsx": "Files",
      "app/src/components/store-view/store-page.tsx": "Agent Store (in app)",
      "app/src/components/settings/general.tsx": "Settings",
      "app/src/components/shell/sidebar.tsx": "App shell",
      "app/src/components/shell/agent-sidebar-items.tsx": "Your Agents",
      "app/src/components/team-view/team-view.tsx": "Your teams",
      "agentstore/src/app/page.tsx": "Store website",
      "packages/web/src/app-tree.tsx": "Web app",
      "ui/board/src/mission-board.tsx": "ui/board (library)",
    };
    for (const [path, label] of Object.entries(cases)) {
      assert.equal(surfaceOf(path), label, path);
    }
  });

  it("falls back to the folder rather than dropping a hit", () => {
    assert.equal(surfaceOf("tools/analysis/thing.tsx"), "tools/analysis");
    assert.equal(
      surfaceOf("packages/host/src/routes/agents.ts"),
      "packages/host/src",
    );
  });

  it("scans the frontends and every ui package but the showcase", () => {
    for (const root of [
      "app/src",
      "agentstore/src",
      "packages/web/src",
      "ui/core/src",
    ]) {
      assert.ok(SCAN_ROOTS.includes(root), root);
    }
    assert.ok(
      !SCAN_ROOTS.some((root) => root.startsWith("ui/showcase")),
      "the showcase importing a component is documentation, not usage",
    );
  });
});
