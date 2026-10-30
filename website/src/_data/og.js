// Share cards for link previews, made by scripts/make-og-images.sh:
// og.cards.<card>.<lang> is the absolute URL of src/og/<card>-<lang>.jpg.
// The URL carries a hash of the file because Slack, LinkedIn and WhatsApp
// cache a card by its URL: a new card under the old URL keeps the old preview.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../og/", import.meta.url);
const cards = {};
for (const file of readdirSync(dir)) {
  const [, card, lang] = file.match(/^(.+)-(\w+)\.jpg$/) || [];
  if (!card) continue;
  const hash = createHash("sha256")
    .update(readFileSync(new URL(file, dir)))
    .digest("hex")
    .slice(0, 10);
  cards[card] ??= {};
  cards[card][lang] = `https://gethouston.ai/og/${file}?v=${hash}`;
}

export default { cards, width: 1200, height: 630 };
