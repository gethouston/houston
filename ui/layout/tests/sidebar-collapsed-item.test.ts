import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  sidebarCollapsedItem,
  sidebarPersonRow,
  sidebarRingClearance,
} from "../src/sidebar-geometry.ts";
import { sidebarCollapsedItemClasses } from "../src/sidebar-paint.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const px = (token: string) => {
  const n = Number(token.replace(/^-/, "").split("-").pop());
  return (token.startsWith("-") ? -n : n) * 4;
};
const classes = (value: string) => value.split(/\s+/).filter(Boolean);

describe("collapsed rail item", () => {
  it("seats an AI Employee's avatar AND its running ring inside the square", () => {
    strictEqual(px(sidebarCollapsedItem.square), 36);
    const ring = sidebarCollapsedItem.avatarDiameter + sidebarRingClearance;
    ok(ring < 36, `a ${ring}px ring fills the 36px square`);
    // Even air on every side, so the ring is centred on whole pixels.
    ok(Number.isInteger((36 - ring) / 2));
    // Smaller than the expanded rail's portrait, which fills a 44px row.
    ok(sidebarCollapsedItem.avatarDiameter < sidebarPersonRow.avatarDiameter);
  });

  it("hands the avatar its collapsed diameter, and the flyout keeps the portrait", () => {
    const item = read("src/sidebar-collapsed-item.tsx");
    ok(
      item.includes(
        "<SidebarAvatarDiameter value={sidebarCollapsedItem.avatarDiameter}>",
      ),
    );
    ok(item.includes("sidebarCollapsedItem.square"));
  });

  it("perches the needs-you chip on the avatar's shoulder", () => {
    // The chip (h-5, min-w-7: 28 x 20) scales about its own centre, so its
    // centre is where its box is anchored. The avatar's shoulder is the point
    // of its circle at 45 degrees, up and right of the square's centre.
    const trailing = classes(sidebarCollapsedItemClasses.trailing);
    const top = trailing.find((c) => /^-?top-/.test(c));
    const right = trailing.find((c) => /^-?right-/.test(c));
    ok(top && right, sidebarCollapsedItemClasses.trailing);
    const chipX = 36 - px(right) - 28 / 2;
    const chipY = px(top) + 20 / 2;
    const r = sidebarCollapsedItem.avatarDiameter / 2;
    const shoulder = 18 + r * Math.SQRT1_2;
    const shoulderY = 18 - r * Math.SQRT1_2;
    ok(Math.abs(chipX - shoulder) <= 1, `chip x ${chipX} vs ${shoulder}`);
    ok(Math.abs(chipY - shoulderY) <= 1, `chip y ${chipY} vs ${shoulderY}`);
  });
});

describe("the README documents the person row", () => {
  it("names its anatomy, its second line and its geometry", () => {
    const readme = read("README.md");
    ok(readme.includes('anatomy="person"'));
    ok(readme.includes("subtitle"));
    ok(readme.includes("sidebarPersonRow"));
    ok(readme.includes("sidebarCollapsedItem"));
  });
});
