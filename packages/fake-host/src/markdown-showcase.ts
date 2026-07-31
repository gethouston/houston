/**
 * A fixed markdown document so the visual suite can pin the chat type scale
 * (HOU-1051): all six heading levels, bold/italic/strikethrough emphasis,
 * ordered + unordered (nested) lists, a blockquote, inline code, a fenced code
 * block, a table, and a link. Served by `cannedReply` when the user's text
 * mentions "markdown"; everything else keeps the plain echo the functional
 * specs assert on. The chat-markdown visual spec sizes its viewport so this
 * whole document fits without scrolling — growing it means retuning that spec.
 */
export const MARKDOWN_SHOWCASE = [
  "# Tokyo, distilled",
  "The plan in one page: *when to go*, **what it costs**, and the ~~guesswork~~ research.",
  "## Where the money goes",
  "1. **Flights**: book 8 weeks out",
  "2. **Hotel**: Shinjuku, near the JR line",
  "3. **Food**: konbini breakfasts, one splurge dinner",
  "> Rule of thumb: if a day needs more than three bookings, cut one.",
  "### Day one",
  "Land, drop the bags, then:",
  "- Walk Omoide Yokocho at dusk\n- Vending-machine coffee, *mandatory*\n  - The corn soup one, specifically",
  "#### Getting around",
  "| Item | Cost |\n| --- | --- |\n| Flights | $850 |\n| Hotel | $120/night |",
  "##### Rail passes",
  "The JR Pass math only works if you leave the city twice.",
  "###### Fine print",
  "Prices move; treat these as *estimates*, not quotes.",
  '```ts\nconst trip = { city: "Tokyo", nights: 5 };\n```',
  "Budget lives in `trip.md`; [this guide](https://example.com) covers rail passes.",
  "That is the whole plan.",
].join("\n\n");
