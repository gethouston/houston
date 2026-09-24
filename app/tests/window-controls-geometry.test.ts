import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import {
  sidebarWindowControlsHeight,
  sidebarWindowControlsWidth,
} from "../../ui/layout/src/sidebar-geometry";

it("keeps the native lights inside the reserved controls zone", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  const { x, y } = config.app.windows[0].trafficLightPosition;
  const width = Number(
    sidebarWindowControlsWidth.match(/^w-\[(\d+)px\]$/)?.[1],
  );

  // Measured on macOS 26: three 14pt circles on a 23pt pitch, 60pt in all.
  // The reserved zone keeps 12pt clear on either side of them.
  const lightSpan = 14 + 2 * 23;
  assert.equal(x, 12);
  assert.equal(width - (x + lightSpan), x);
  // y is the height tao gives the native title-bar container, not the lights'
  // top edge; 22 is what lands their centres on the 40pt row's centre line
  // (measured against the collapse toggle). A new row height needs a new
  // measurement, not arithmetic on y.
  assert.equal(sidebarWindowControlsHeight, "h-10");
  assert.equal(y, 22);
});
