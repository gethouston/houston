import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { avatarHelmetSize } from "../src/components/houston-avatar.tsx";
import {
  ManagerAvatar,
  managerAvatarSizeWithin,
} from "../src/components/manager-avatar.tsx";

const render = (size: number, className?: string) =>
  renderToStaticMarkup(createElement(ManagerAvatar, { size, className }));

const idsOf = (html: string) =>
  [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);

function buttonPaint(): { fill: string; rim: string; label: string } {
  const css = readFileSync(
    new URL("../src/canvas.css", import.meta.url),
    "utf8",
  );
  const rule = css.match(
    /\[data-variant="default"\]:is\(button, a\) \{([^}]+)\}/,
  )?.[1];
  assert.ok(rule, "canvas.css paints the primary Button");
  const token = (pattern: RegExp) => {
    const found = rule.match(pattern)?.[1];
    assert.ok(found, String(pattern));
    return found;
  };
  return {
    fill: token(/background: (var\(--ht-[\w-]+\));/),
    rim: token(/inset 0 0 0 1px (var\(--ht-[\w-]+\));/),
    label: token(/\bcolor: (var\(--ht-[\w-]+\));/),
  };
}

describe("ManagerAvatar", () => {
  it("fills the requested square box and stays decorative", () => {
    for (const size of [16, 24, 32, 52, 96]) {
      const html = render(size, "extra");
      assert.match(html, new RegExp(`width="${size}" height="${size}"`));
      assert.match(html, /viewBox="0 0 100 100"/);
      assert.match(html, /aria-hidden="true"/);
      assert.match(html, /class="shrink-0 extra"/);
    }
  });

  it("is a disc filling its box, round like every employee avatar", () => {
    const html = render(32);
    const disc = '<circle cx="50" cy="50" r="50"';
    assert.equal(html.split(disc).length - 1, 3);
    assert.match(html, /<clipPath[^>]*><circle cx="50" cy="50" r="50"/);
  });

  it("wears a thin halo outside the disc, drawn past its box", () => {
    const html = render(24);
    assert.match(html, /overflow="visible"/);
    const halo = html.match(
      /<circle cx="50" cy="50" r="([\d.]+)" fill="none" stroke-width="([\d.]+)" style="stroke:var\(--ht-cta\)" data-manager-halo=""/,
    );
    assert.ok(halo, "the halo");
    const px = (units: number) => (Number(units) * 24) / 100;
    assert.equal(Number(px(Number(halo[2])).toFixed(2)), 1);
    const inner = px(Number(halo[1]) - Number(halo[2]) / 2);
    assert.equal(Number((inner - 12).toFixed(2)), 1.5);
    const outer = px(Number(halo[1]) + Number(halo[2]) / 2) * 2;
    assert.equal(Number(outer.toFixed(2)), 29);
    const big = render(40).match(
      /r="([\d.]+)" fill="none" stroke-width="([\d.]+)"/,
    );
    assert.ok(big);
    const px40 = (units: number) => (Number(units) * 40) / 100;
    assert.equal(Number(px40(Number(big[2])).toFixed(2)), 1.5);
    assert.equal(
      Number((px40(Number(big[1]) - Number(big[2]) / 2) - 20).toFixed(2)),
      2.25,
    );
    assert.ok(html.indexOf("data-manager-halo") < html.indexOf("<g transform"));
  });

  it("wears the primary Button's own fill, rim and label tokens", () => {
    const paint = buttonPaint();
    for (const size of [20, 52]) {
      const html = render(size);
      assert.ok(html.includes(`fill:${paint.fill}`), `${size}px fill`);
      assert.ok(html.includes(`stroke:${paint.rim}`), `${size}px rim`);
      assert.ok(html.includes(`fill:${paint.label}`), `${size}px helmet`);
    }
  });

  it("paints no colour of its own and fakes no depth", () => {
    for (const size of [20, 52]) {
      const html = render(size);
      const vars = new Set(html.match(/var\(--ht-[\w-]+\)/g));
      assert.deepEqual([...vars].sort(), [
        "var(--ht-cta)",
        "var(--ht-cta-rim)",
        "var(--ht-cta-text)",
      ]);
      assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b|rgba?\(/i);
      assert.doesNotMatch(html, /<filter|Gradient|mask=/, `${size}px`);
    }
    const source = readFileSync(
      new URL("../src/components/manager-avatar.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it("keeps the rim one pixel inside the edge at every size", () => {
    for (const size of [20, 24, 52, 96]) {
      const html = render(size);
      assert.match(
        html,
        /stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url\(#[\w-]+\)"/,
        `${size}px`,
      );
    }
  });

  it("seats the helmet on whole pixels, sized like the employee avatar's", () => {
    for (const size of [20, 24, 28, 52]) {
      const glyphPx = avatarHelmetSize(size);
      const insetPx = (size - glyphPx) / 2;
      assert.ok(Number.isInteger(insetPx), `${size}px inset ${insetPx}`);
      const unit = (px: number) => Number(((px * 100) / size).toFixed(3));
      const html = render(size);
      const at = unit(insetPx);
      assert.ok(html.includes(`translate(${at} ${at})`), `${size}px seat`);
      const glyph = unit(glyphPx);
      assert.ok(
        html.includes(`width="${glyph}" height="${glyph}"`),
        `${size}px glyph`,
      );
    }
    assert.match(render(32), /viewBox="0 0 412\.248 448\.898"/);
  });

  it("gives every instance its own ids, every one referenced", () => {
    for (const size of [52, 20]) {
      const html = renderToStaticMarkup(
        createElement(
          Fragment,
          null,
          createElement(ManagerAvatar, { size }),
          createElement(ManagerAvatar, { size }),
        ),
      );
      const ids = idsOf(html);
      assert.equal(ids.length, idsOf(render(size)).length * 2);
      assert.equal(new Set(ids).size, ids.length);
      for (const id of ids) {
        assert.match(id, /^[\w-]+$/);
        assert.ok(html.includes(`url(#${id})`), id);
      }
    }
  });
});

describe("managerAvatarSizeWithin", () => {
  const extent = (size: number) => {
    const halo = render(size).match(
      /r="([\d.]+)" fill="none" stroke-width="([\d.]+)"/,
    );
    assert.ok(halo);
    return ((Number(halo[1]) + Number(halo[2]) / 2) * 2 * size) / 100;
  };

  it("picks the largest disc whose halo still fits the slot", () => {
    for (const slot of [24, 29, 52, 56]) {
      const size = managerAvatarSizeWithin(slot);
      assert.ok(extent(size) <= slot + 0.01, `${slot}px slot`);
      assert.ok(extent(size + 1) > slot, `${slot}px: one more overflows`);
    }
    assert.equal(managerAvatarSizeWithin(52), 42);
  });
});
