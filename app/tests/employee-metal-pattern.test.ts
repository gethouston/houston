import { notStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  employeeEngravingColor,
  employeeEngravingRole,
  employeeMetalPattern,
  employeeMetalSeed,
  roleLabelIndex,
} from "../src/components/employee-card/employee-metal-pattern.ts";
import en from "../src/locales/en/agent-onboarding.json" with { type: "json" };
import es from "../src/locales/es/agent-onboarding.json" with { type: "json" };
import pt from "../src/locales/pt/agent-onboarding.json" with { type: "json" };

const index = roleLabelIndex([
  en.roleSetup.roles,
  es.roleSetup.roles,
  pt.roleSetup.roles,
]);

describe("employee metal engraving", () => {
  it("reproduces the same fingerprint, independent of names", () => {
    const badge = { color: "forest", role: "Finance manager", name: "" };
    const seed = employeeMetalSeed(badge.color, badge.role);
    const path = employeeMetalPattern(seed);
    badge.name = "Ava";
    strictEqual(employeeMetalSeed(badge.color, badge.role), seed);
    strictEqual(employeeMetalPattern(seed), path);
    strictEqual(seed, employeeMetalSeed("forest", "Finance manager"));
  });

  it("distinguishes colors, roles and ambiguous concatenations", () => {
    const fingerprints = new Set(
      ["forest", "charcoal", "golden"].flatMap((color) =>
        ["Finance", "Operations", "Assistant"].map((role) =>
          employeeMetalPattern(employeeMetalSeed(color, role)),
        ),
      ),
    );
    strictEqual(fingerprints.size, 9);
    notStrictEqual(employeeMetalSeed("ab", "c"), employeeMetalSeed("a", "bc"));
  });

  it("bounds geometry and work even with empty or Unicode inputs", () => {
    for (const role of ["", "Operações", "財務", "x".repeat(1000)]) {
      const path = employeeMetalPattern(employeeMetalSeed("navy", role));
      strictEqual((path.match(/M/g) ?? []).length, 64);
      strictEqual((path.match(/L/g) ?? []).length, 64 * 24);
      ok(path.length < 30000);
      ok(!/NaN|Infinity/.test(path));
      const coordinates = [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)];
      ok(
        coordinates.every(
          ([, x, y]) =>
            Number(x) >= 0 && Number(x) <= 360 && Math.abs(Number(y)) < 300,
        ),
      );
    }
  });

  it("engraves a catalog role the same in every language", () => {
    const key = employeeEngravingRole(
      en.roleSetup.roles.academic_advisor,
      index,
    );
    strictEqual(
      employeeEngravingRole(es.roleSetup.roles.academic_advisor, index),
      key,
    );
    strictEqual(
      employeeEngravingRole(pt.roleSetup.roles.academic_advisor, index),
      key,
    );
    strictEqual(employeeEngravingRole("  ACADEMIC ADVISOR ", index), key);
  });

  it("engraves a typed role by its words", () => {
    strictEqual(
      employeeEngravingRole("Chief vibes officer", index),
      employeeEngravingRole(" chief VIBES officer", index),
    );
    notStrictEqual(
      employeeEngravingRole("Chief vibes officer", index),
      employeeEngravingRole(en.roleSetup.roles.academic_advisor, index),
    );
  });

  it("engraves a palette color the same whichever form is stored", () => {
    const palette = [{ id: "forest", light: "#1a4", dark: "#2b5" }];
    strictEqual(employeeEngravingColor("#1a4", palette), "forest");
    strictEqual(employeeEngravingColor("#2b5", palette), "forest");
    strictEqual(employeeEngravingColor("forest", palette), "forest");
    strictEqual(employeeEngravingColor(undefined, palette), "forest");
    strictEqual(employeeEngravingColor("#abcdef", palette), "#abcdef");
  });
});
