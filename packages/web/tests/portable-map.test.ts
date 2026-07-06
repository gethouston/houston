import { packAgent, unpackAgent } from "@houston/domain";
import { expect, test } from "vitest";
import {
  packagePreview,
  toWireSelection,
} from "../src/engine-adapter/portable-map";

/**
 * The v1-wizard ↔ v3-wire mappings for portable agents. The wizards keep the
 * old client's field names; the host speaks the protocol's PortableSelection.
 */

const NOW = "2026-07-04T00:00:00.000Z";

function pkg() {
  return unpackAgent(
    packAgent(
      {
        claudeMd: "# Role\nYou are the   sales agent.",
        skills: [
          {
            slug: "research",
            body: "---\nname: research\ndescription: Deep dive\n---\nBody",
          },
        ],
        routines: [
          {
            id: "r1",
            name: "Daily",
            description: "",
            prompt: "check the pipeline",
            schedule: "0 9 * * *",
            enabled: true,
            suppress_when_silent: false,
            chat_mode: "shared",
            integrations: [],
            created_at: NOW,
            updated_at: NOW,
          },
        ],
        learnings: [{ id: "l1", text: "Be concise.", created_at: NOW }],
      },
      { agentName: "Sales", exporter: "Daniel", houstonVersion: "0.5.0" },
      NOW,
    ),
  );
}

test("toWireSelection renames the include* fields to the protocol shape", () => {
  expect(
    toWireSelection({
      includeClaudeMd: true,
      includeSkillSlugs: ["a"],
      includeRoutineIds: ["b"],
      includeLearningIds: ["c"],
    }),
  ).toEqual({
    includeClaudeMd: true,
    skillSlugs: ["a"],
    routineIds: ["b"],
    learningIds: ["c"],
  });
});

test("packagePreview maps a package into the wizard's preview shape", () => {
  const { manifest, preview } = packagePreview(pkg());
  expect(manifest).toMatchObject({
    agentName: "Sales",
    exporter: "Daniel",
    anonymized: false,
    createdAt: NOW,
  });
  expect(preview.claudeMd?.excerpt).toBe("# Role You are the sales agent.");
  expect(preview.claudeMd?.byteCount).toBeGreaterThan(0);
  expect(preview.skills).toEqual([
    expect.objectContaining({ slug: "research", description: "Deep dive" }),
  ]);
  expect(preview.routines).toEqual([
    expect.objectContaining({
      id: "r1",
      name: "Daily",
      promptExcerpt: "check the pipeline",
      schedule: "0 9 * * *",
      enabled: true,
    }),
  ]);
  expect(preview.learnings).toEqual([
    { id: "l1", text: "Be concise.", createdAt: NOW },
  ]);
});

test("a package without CLAUDE.md previews claudeMd as null", () => {
  const bare = unpackAgent(
    packAgent(
      { skills: [], routines: [], learnings: [] },
      { agentName: "Bare", houstonVersion: "0.5.0" },
      NOW,
    ),
  );
  expect(packagePreview(bare).preview.claudeMd).toBeNull();
});
