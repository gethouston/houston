import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { postableImage } from "../src/components/organization/org-chart-share-encode.ts";

describe("postableImage", () => {
  const png = (size: number) =>
    new File([new Uint8Array(size)], "org-chart.png", { type: "image/png" });
  const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });

  it("posts the drawn PNG when it fits LinkedIn's cap", async () => {
    const file = png(10);
    let asked = false;
    const sent = await postableImage(
      file,
      async () => {
        asked = true;
        return jpeg;
      },
      10,
    );
    strictEqual(sent, file);
    strictEqual(asked, false);
  });

  it("re-encodes a PNG over the cap as a JPEG", async () => {
    strictEqual(await postableImage(png(11), async () => jpeg, 10), jpeg);
  });
});
