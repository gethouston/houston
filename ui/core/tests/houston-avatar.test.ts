import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { employeeMetal } from "@houston/design-tokens";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  avatarHelmetSize,
  HoustonAvatar,
} from "../src/components/houston-avatar.tsx";
import {
  EMPLOYEE_METAL_LIGHT,
  EMPLOYEE_METAL_SHADE,
  employeeAvatarPaint,
  employeeMetalColors,
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

describe("HoustonAvatar", () => {
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
