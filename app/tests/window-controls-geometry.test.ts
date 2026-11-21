import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import {
  sidebarWindowControlsHeight,
  sidebarWindowControlsWidth,
} from "../../ui/layout/src/sidebar-frame";

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

  const lightSpan = 14 + 2 * 23;
  assert.equal(x, 12);
  assert.equal(width - (x + lightSpan), x);
  assert.equal(sidebarWindowControlsHeight, "h-10");
  assert.equal(y, 22);
});
