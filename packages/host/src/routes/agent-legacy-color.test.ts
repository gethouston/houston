import { expect, test, vi } from "vitest";
import { MemoryVfs } from "../vfs";
import { legacyAgentColor } from "./agent-legacy-color";

/**
 * The Rust-era engine persisted each agent's color in
 * `<agentRoot>/.houston/agent.json` (AgentMeta.color). The v3 host serves it
 * as a read-only legacy passthrough; every failure mode must read as "no
 * color" (the client falls back to its default), never as an error.
 */

const ROOT = "Personal/Sales";

async function withMeta(meta: unknown): Promise<string | undefined> {
  const vfs = new MemoryVfs();
  await vfs.writeText(
    `${ROOT}/.houston/agent.json`,
    typeof meta === "string" ? meta : JSON.stringify(meta),
  );
  return legacyAgentColor(vfs, ROOT);
}

test("reads the Rust-era color out of agent.json", async () => {
  await expect(
    withMeta({ id: "u1", config_id: "blank", color: "forest" }),
  ).resolves.toBe("forest");
});

test("absent agent.json reads as no color (post-cutover agents)", async () => {
  await expect(
    legacyAgentColor(new MemoryVfs(), ROOT),
  ).resolves.toBeUndefined();
});

test("a null / empty / non-string color reads as no color", async () => {
  await expect(withMeta({ color: null })).resolves.toBeUndefined();
  await expect(withMeta({ color: "" })).resolves.toBeUndefined();
  await expect(withMeta({ color: 7 })).resolves.toBeUndefined();
  await expect(withMeta({})).resolves.toBeUndefined();
});

test("corrupt agent.json is logged and read as no color, never thrown", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await expect(withMeta("{not json")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  } finally {
    warn.mockRestore();
  }
});
