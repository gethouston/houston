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
  const width = Number(sidebarWindowControlsWidth.match(/\d+/)?.[0]);
  const height = Number(sidebarWindowControlsHeight.match(/\d+/)?.[0]) * 4;

  // The 14pt circles on macOS 26 sit on a 23pt pitch. The controls zone keeps
  // 12pt clear on either side, while y=22 centres them on its 40pt row.
  const lightDiameter = 14;
  const lightPitch = 23;
  const lightSpan = lightDiameter + 2 * lightPitch;
  assert.equal(x, 12);
  assert.equal(y, 22);
  assert.equal(lightSpan, 60);
  assert.equal(width - (x + lightSpan), 12);
  assert.equal(height, 40);
  const geometrySource = readFileSync(
    new URL("../../ui/layout/src/sidebar-geometry.ts", import.meta.url),
    "utf8",
  );
  assert.ok(geometrySource.includes("host window controls zone"));
  assert.ok(!geometrySource.includes("app/src-tauri"));
});
