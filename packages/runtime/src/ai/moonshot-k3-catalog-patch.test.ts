import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import "./moonshot-k3-catalog-patch";
import { piModelIds } from "./pi-catalog";

test("Kimi K3 is injected into the moonshotai catalog", () => {
  const m = getModel("moonshotai", "kimi-k3" as Parameters<typeof getModel>[1]);
  expect(m).toBeDefined();
  expect(m?.name).toBe("Kimi K3");
  expect(m?.contextWindow).toBe(1048576);
  expect(m?.reasoning).toBe(true);
  expect(piModelIds("moonshotai")).toContain("kimi-k3");
});

test("the patch is idempotent (re-import cannot duplicate the entry)", async () => {
  const { ensureMoonshotKimiK3 } = await import("./moonshot-k3-catalog-patch");
  ensureMoonshotKimiK3();
  ensureMoonshotKimiK3();
  const ids = piModelIds("moonshotai").filter((id) => id === "kimi-k3");
  expect(ids).toHaveLength(1);
});
