import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { houstonSystemPrompt } from "@houston/host/src/houston-prompt";
import { expect, test } from "vitest";
import { buildBridgedToolSet } from "../backends/claude/mcp-tool-set";
import { buildSystemPrompt } from "../backends/claude/system-prompt";
import { makeAgentLoader } from "./resource-loader";

/**
 * The fixed prefix every model request re-sends, for an agent with twenty
 * skills: Houston's product prompt, each backend's assembled system prompt,
 * and the Houston tools both backends advertise. Every byte here is paid on
 * every request of every turn, so growth must be a decision, not drift.
 *
 * Budgets are bytes with a few percent of headroom. Raising one means saying
 * in the PR what the new text buys; a situational rule belongs in the tool
 * description or tool result of the workflow that needs it instead.
 */
const BUDGET = {
  productPrompt: 20_000,
  claudeSystemPrompt: 28_750,
  piSystemPrompt: 28_750,
  houstonTools: 27_250,
};

const SKILLS = 20;

function fixtureAgent(): string {
  const dir = mkdtempSync(join(tmpdir(), "houston-budget-"));
  mkdirSync(join(dir, ".houston"), { recursive: true });
  writeFileSync(
    join(dir, "CLAUDE.md"),
    `---\nindustry: Finance\nrole: Bookkeeper\n---\n\n${"You keep the books for a small company. ".repeat(25)}`,
  );
  for (let i = 0; i < SKILLS; i++) {
    const slug = `do-task-number-${i}`;
    mkdirSync(join(dir, ".agents", "skills", slug), { recursive: true });
    writeFileSync(
      join(dir, ".agents", "skills", slug, "SKILL.md"),
      `---\nname: ${slug}\ndescription: "Get a clear read on task ${i}: what is open, what is late, and what to close first. ${"It covers every register, ranks issues by impact, and calls out one move for this week. ".repeat(4)}"\n---\n\n## Workflow\n1. **Do it** - Do the thing.\n`,
    );
  }
  return dir;
}

const product = houstonSystemPrompt({ triggers: true });

test("the product prompt stays within its budget", () => {
  expect(product.length).toBeLessThanOrEqual(BUDGET.productPrompt);
});

test("the Claude system prompt for a twenty-skill agent stays within its budget", () => {
  const prompt = buildSystemPrompt(fixtureAgent(), product, "execute");
  expect(prompt).toContain("<name>do-task-number-19</name>");
  expect(prompt.length).toBeLessThanOrEqual(BUDGET.claudeSystemPrompt);
});

test("the pi system prompt for a twenty-skill agent stays within its budget", async () => {
  const loader = makeAgentLoader(
    fixtureAgent(),
    "execute",
    undefined,
    product,
    "",
    null,
  );
  await loader.reload();
  const prompt = [
    loader.getSystemPrompt(),
    ...loader.getAgentsFiles().agentsFiles.map((f) => f.content),
    formatSkillsForPrompt(loader.getSkills().skills),
  ].join("\n\n");
  expect(loader.getSkills().skills).toHaveLength(SKILLS);
  expect(prompt.length).toBeLessThanOrEqual(BUDGET.piSystemPrompt);
});

test("the Houston tools both backends advertise stay within their budget", () => {
  const tools = buildBridgedToolSet({
    integrations: { call: async () => new Response("{}") },
    browser: { workspaceDir: tmpdir(), liveView: true },
    mode: "execute",
    providers: [
      {
        id: "anthropic",
        name: "Claude",
        connected: true,
        models: ["claude-sonnet-5-5"],
      },
    ],
  });
  const bytes = tools
    .map((t) =>
      JSON.stringify({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }),
    )
    .join("").length;
  expect(tools.map((t) => t.name)).toContain("integration_execute");
  expect(bytes).toBeLessThanOrEqual(BUDGET.houstonTools);
});
