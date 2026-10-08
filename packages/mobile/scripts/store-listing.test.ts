import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("store listing limits and links for all supported locales", () => {
  for (const locale of ["en-US", "es-MX", "pt-BR"]) {
    const ios = `store/metadata/${locale}`;
    const android = `store/metadata/android/${locale}`;
    for (const [file, limit] of [
      [`${ios}/name.txt`, 30],
      [`${ios}/subtitle.txt`, 30],
      [`${ios}/promotional_text.txt`, 170],
      [`${ios}/keywords.txt`, 100],
      [`${android}/title.txt`, 30],
      [`${android}/short_description.txt`, 80],
      [`${android}/full_description.txt`, 4000],
    ] as const) {
      const content = readFileSync(file, "utf8").trim();
      expect(content.length, file).toBeLessThanOrEqual(limit);
      expect(content, file).not.toContain("—");
    }
    expect(readFileSync(`${ios}/support_url.txt`, "utf8").trim()).toBe(
      "https://gethouston.ai",
    );
    expect(readFileSync(`${ios}/privacy_url.txt`, "utf8").trim()).toBe(
      "https://gethouston.ai/privacy/",
    );
  }
});
