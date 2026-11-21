import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { employeeMetal } from "@houston/design-tokens";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  avatarHelmetSize,
  HELMET_PATHS,
  HoustonAvatar,
} from "../src/components/houston-avatar.tsx";
import {
  EMPLOYEE_METAL_LIGHT,
  EMPLOYEE_METAL_SHADE,
  employeeAvatarPaint,
  employeeMetalColors,
  hexColorMix,
} from "../src/employee-metal.ts";

const PAINT = "var(--ht-agent-navy)";

describe("employee metal recipe", () => {
  it("mixes the identity into shade and light at the token ratios", () => {
    const metal = employeeMetalColors(PAINT);
    assert.equal(
      metal.top,
      `color-mix(in srgb, ${PAINT} ${employeeMetal.top * 100}%, ${EMPLOYEE_METAL_SHADE})`,
    );
    assert.equal(
      metal.bottom,
      `color-mix(in srgb, ${PAINT} ${employeeMetal.bottom * 100}%, ${EMPLOYEE_METAL_SHADE})`,
    );
    assert.equal(
      metal.relief,
      `color-mix(in srgb, ${PAINT} ${employeeMetal.relief * 100}%, ${EMPLOYEE_METAL_LIGHT})`,
    );
  });

  it("paints the avatar disc from the badge surface and relief", () => {
    const metal = employeeMetalColors(PAINT);
    const avatar = employeeAvatarPaint(PAINT);
    assert.equal(
      avatar.background,
      `linear-gradient(135deg, ${metal.top}, ${metal.bottom})`,
    );
    assert.equal(avatar.helmet, metal.relief);
    assert.match(avatar.boxShadow, /^inset 0 1px 0 color-mix/);
  });
});

describe("hexColorMix", () => {
  it("mixes opaque hex colours channel by channel, like color-mix in srgb", () => {
    assert.equal(hexColorMix("#ffffff", 0.25, "#000000"), "#404040");
    assert.equal(hexColorMix("#1b6b3a", 1, "#0d0d0d"), "#1b6b3a");
    assert.equal(hexColorMix("#1b6b3a", 0, "#0d0d0d"), "#0d0d0d");
    assert.equal(hexColorMix("#f00", 0.5, "#0000ff"), "#800080");
    for (const bad of ["#0000ffcc", "#12345", "var(--ht-agent-navy)", "red"])
      assert.throws(() => hexColorMix(bad, 0.5, "#000000"), /opaque/);
  });

  it("drives the same metal recipe to plain hex for a canvas", () => {
    const metal = employeeMetalColors(
      "#1b6b3a",
      "#ffffff",
      "#0d0d0d",
      hexColorMix,
    );
    for (const value of Object.values(metal))
      assert.match(value, /^#[0-9a-f]{6}$/);
  });
});

describe("HoustonAvatar", () => {
  it("keeps the helmet's visor bar where its rect transform put it", () => {
    const t = (-89.717 * Math.PI) / 180;
    const corners = [
      [0, 0],
      [15.334, 0],
      [15.334, 16.211],
      [0, 16.211],
    ].map(([x, y]) => [
      258.6 + x * Math.cos(t) - y * Math.sin(t),
      409.939 + x * Math.sin(t) + y * Math.cos(t),
    ]);
    const bar = HELMET_PATHS.find((d) => d.startsWith("M258.600"));
    const points = [...(bar ?? "").matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(
      (m) => [Number(m[1]), Number(m[2])],
    );
    assert.equal(points.length, 4);
    points.forEach(([x, y], i) => {
      assert.ok(Math.abs(x - corners[i][0]) < 0.001, `x ${i}`);
      assert.ok(Math.abs(y - corners[i][1]) < 0.001, `y ${i}`);
    });
  });

  it("draws every helmet path", () => {
    const html = renderToStaticMarkup(createElement(HoustonAvatar));
    assert.equal(html.match(/<path /g)?.length, HELMET_PATHS.length);
  });

  it("wears the employee metal with the helmet in relief", () => {
    for (const diameter of [16, 20, 24, 32, 40]) {
      const html = renderToStaticMarkup(
        createElement(HoustonAvatar, { color: PAINT, diameter }),
      );
      const metal = employeeMetalColors(PAINT);
      assert.ok(html.includes("linear-gradient(135deg"), html);
      assert.ok(html.includes(`fill:${metal.relief}`), html);
    }
  });

  it("gives a colourless avatar the same metal in the neutral gray", () => {
    const html = renderToStaticMarkup(createElement(HoustonAvatar));
    assert.ok(
      html.includes(employeeMetalColors("var(--ht-ink-muted)").relief),
      html,
    );
  });

  it("keeps the running ring around a smaller disc", () => {
    const html = renderToStaticMarkup(
      createElement(HoustonAvatar, {
        color: PAINT,
        diameter: 40,
        running: true,
      }),
    );
    assert.ok(html.includes("avatar-running-ring"), html);
    assert.ok(html.includes("width:36px"), html);
  });
});

describe("avatarHelmetSize", () => {
  it("centers the helmet on whole pixels at 65%", () => {
    for (let diameter = 12; diameter <= 96; diameter++) {
      const size = avatarHelmetSize(diameter);
      assert.equal((diameter - size) % 2, 0, `disc ${diameter}: ${size}`);
      assert.ok(
        Math.abs(size - diameter * 0.65) <= 1,
        `disc ${diameter}: ${size} strays from 65%`,
      );
    }
  });
});
