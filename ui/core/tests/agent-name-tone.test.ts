import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { AGENT_COLORS, agentColorId } from "../src/agent-colors.ts";
import {
  AGENT_NAME_CONTRAST_MIN,
  AGENT_NAME_FALLBACK_CLASS,
  agentNameContrast,
  agentNameToneClass,
  nameToneClassFor,
} from "../src/agent-name-tone.ts";
import {
  contrastRatio,
  flattenColor,
  parseColor,
  relativeLuminance,
} from "../src/color-contrast.ts";

/**
 * The promise under test: an agent's name in a chat bubble is rendered in that
 * agent's own colour ONLY where that colour is actually readable. Legibility is
 * measured from the design tokens, so a palette edit that breaks a name breaks
 * this test instead of shipping.
 */

describe("color-contrast", () => {
  it("matches the WCAG anchors", () => {
    assert.equal(contrastRatio("#ffffff", "#000000"), 21);
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#1e4d8c", "#1e4d8c"), 1);
    assert.equal(contrastRatio("#fff", "#000"), 21);
  });

  it("parses every supported form to the same colour", () => {
    assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColor("#ffffff"), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColor("rgb(255, 255, 255)"), {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
    assert.deepEqual(parseColor("rgba(38, 38, 40, 0.55)"), {
      r: 38,
      g: 38,
      b: 40,
      a: 0.55,
    });
    assert.equal(parseColor("#ffffff80").a, 128 / 255);
  });

  it("throws on a colour it does not understand, rather than guessing", () => {
    assert.throws(() => parseColor("rebeccapurple"), /unsupported color/);
    assert.throws(() => parseColor("#ff"), /unsupported hex color/);
    assert.throws(
      () => parseColor("color-mix(in srgb, #fff, #000)"),
      /unsupported color/,
    );
  });

  it("refuses to measure a translucent colour", () => {
    assert.throws(
      () => contrastRatio("rgba(38, 38, 40, 0.55)", "#141416"),
      /translucent/,
    );
  });

  it("composites a known alpha case", () => {
    // 50% black over white lands exactly halfway.
    const half = flattenColor(
      parseColor("rgba(0, 0, 0, 0.5)"),
      parseColor("#ffffff"),
    );
    assert.deepEqual(half, { r: 127.5, g: 127.5, b: 127.5, a: 1 });
    // A fully opaque foreground erases the backdrop.
    assert.deepEqual(
      flattenColor(parseColor("#ff0000"), parseColor("#00ff00")),
      {
        r: 255,
        g: 0,
        b: 0,
        a: 1,
      },
    );
    // A fully transparent foreground leaves the backdrop untouched.
    assert.deepEqual(
      flattenColor(parseColor("rgba(255, 0, 0, 0)"), parseColor("#00ff00")),
      { r: 0, g: 255, b: 0, a: 1 },
    );
  });

  it("computes WCAG relative luminance at the endpoints", () => {
    assert.equal(relativeLuminance(parseColor("#000000")), 0);
    assert.equal(relativeLuminance(parseColor("#ffffff")), 1);
  });
});

describe("agent name contrast", () => {
  it("measures every palette colour in both themes", () => {
    const measured = agentNameContrast();
    assert.deepEqual(
      Object.keys(measured).sort(),
      AGENT_COLORS.map((c) => c.id).sort(),
    );
  });

  it("keeps every agent name readable in BOTH themes today", () => {
    for (const [id, ratios] of Object.entries(agentNameContrast())) {
      assert.ok(
        ratios.light >= AGENT_NAME_CONTRAST_MIN,
        `agent-${id} light: ${ratios.light.toFixed(2)}:1 is below ${AGENT_NAME_CONTRAST_MIN}:1`,
      );
      assert.ok(
        ratios.dark >= AGENT_NAME_CONTRAST_MIN,
        `agent-${id} dark: ${ratios.dark.toFixed(2)}:1 is below ${AGENT_NAME_CONTRAST_MIN}:1`,
      );
    }
  });

  it("pins the measured worst case in each theme", () => {
    const measured = agentNameContrast();
    // Golden on the light screen and crimson on the dark glass are the two
    // tightest pairs; if a token edit moves them, these numbers move with it.
    assert.equal(measured.golden.light.toFixed(2), "4.92");
    assert.equal(measured.crimson.dark.toFixed(2), "6.02");
    const worstLight = Math.min(...Object.values(measured).map((r) => r.light));
    const worstDark = Math.min(...Object.values(measured).map((r) => r.dark));
    assert.equal(worstLight, measured.golden.light);
    assert.equal(worstDark, measured.crimson.dark);
  });

  it("hands back a copy, not the internal table", () => {
    const first = agentNameContrast();
    first.golden.light = 0;
    assert.ok(agentNameContrast().golden.light > AGENT_NAME_CONTRAST_MIN);
  });
});

describe("agentNameToneClass", () => {
  it("uses the plain agent colour for every palette id today", () => {
    for (const entry of AGENT_COLORS) {
      assert.equal(agentNameToneClass(entry.id), `text-agent-${entry.id}`);
      assert.equal(agentNameToneClass(entry.light), `text-agent-${entry.id}`);
      assert.equal(agentNameToneClass(entry.dark), `text-agent-${entry.id}`);
    }
  });

  it("falls back exactly like agentColorId for missing / unknown values", () => {
    const first = AGENT_COLORS[0].id;
    assert.equal(agentColorId(undefined), first);
    assert.equal(agentColorId("not-a-color"), first);
    assert.equal(agentNameToneClass(undefined), `text-agent-${first}`);
    assert.equal(agentNameToneClass("not-a-color"), `text-agent-${first}`);
    assert.equal(agentNameToneClass(""), `text-agent-${first}`);
  });
});

describe("nameToneClassFor", () => {
  it("covers all four legibility branches", () => {
    assert.equal(
      nameToneClassFor("navy", { lightOk: true, darkOk: true }),
      "text-agent-navy",
    );
    assert.equal(
      nameToneClassFor("navy", { lightOk: true, darkOk: false }),
      "text-agent-navy dark:text-ink",
    );
    assert.equal(
      nameToneClassFor("navy", { lightOk: false, darkOk: true }),
      "text-ink dark:text-agent-navy",
    );
    assert.equal(
      nameToneClassFor("navy", { lightOk: false, darkOk: false }),
      AGENT_NAME_FALLBACK_CLASS,
    );
  });

  it("emits a complete literal class for every palette id, per branch", () => {
    for (const entry of AGENT_COLORS) {
      assert.equal(
        nameToneClassFor(entry.id, { lightOk: true, darkOk: false }),
        `text-agent-${entry.id} dark:text-ink`,
      );
      assert.equal(
        nameToneClassFor(entry.id, { lightOk: false, darkOk: true }),
        `text-ink dark:text-agent-${entry.id}`,
      );
    }
  });

  it("falls back to ink for an id the class table has not learned", () => {
    assert.equal(
      nameToneClassFor("teal", { lightOk: true, darkOk: true }),
      AGENT_NAME_FALLBACK_CLASS,
    );
  });
});
