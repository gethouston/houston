import { expect, test } from "vitest";
import {
  createRunawayDetector,
  isRepetitionLoop,
  LOOP_WINDOW_CHARS,
} from "./runaway-output";

/**
 * The loop detector cuts a reply that degenerated into a short repeating unit.
 * The loops below are the four runaway replies from the 2026-10-03 staging
 * load test (RL2, model space-bunny-free), rebuilt from their repeating units;
 * the legit samples are the content shapes most likely to look repetitive.
 */

const repeat = (unit: string, chars: number) =>
  unit.repeat(Math.ceil(chars / unit.length)).slice(0, chars);

const prose = (chars: number) => {
  const words =
    "the ceramics workshop opens on saturday mornings with clay wheels glaze tables and a kiln for twelve students who book a seat online or at the market stall near the bakery".split(
      " ",
    );
  let out = "";
  for (let i = 0; out.length < chars; i++)
    out += `${words[(i * 7) % words.length]}${i % 13 === 12 ? ".\n" : " "}`;
  return out.slice(0, chars);
};

test("the staging runaway loops are loops", () => {
  // "SymbolSymbol…", "AnchorAnchor…", "LetterLetter…", " 묶 묶…".
  for (const unit of ["Symbol", "Anchor", "Letter", " 묶"])
    expect(isRepetitionLoop(repeat(unit, LOOP_WINDOW_CHARS))).toBe(true);
  // "@\t@\t…" with NULs scattered through it, which breaks strict periodicity.
  let noisy = "";
  for (let i = 0; noisy.length < LOOP_WINDOW_CHARS; i++)
    noisy += i % 7 === 3 ? "\u0000@\t" : "@\t";
  expect(isRepetitionLoop(noisy.slice(0, LOOP_WINDOW_CHARS))).toBe(true);
});

test("legit long output is not a loop", () => {
  expect(isRepetitionLoop(prose(LOOP_WINDOW_CHARS))).toBe(false);
  const table = `| Week | Action | Budget |\n|---|---|---|\n${Array.from(
    { length: 200 },
    (_, i) =>
      `| ${i + 1} | Post ${i % 5} flyers at stall ${i % 9} | ${i * 7} € |`,
  ).join("\n")}`;
  expect(isRepetitionLoop(table.slice(-LOOP_WINDOW_CHARS))).toBe(false);
  const csv = Array.from(
    { length: 600 },
    (_, i) => `${i},${(i * 7) % 13},${(i * 31) % 101}`,
  ).join("\n");
  expect(isRepetitionLoop(csv.slice(-LOOP_WINDOW_CHARS))).toBe(false);
});

test("a window shorter than the judged size is never a loop", () => {
  expect(isRepetitionLoop(repeat("Symbol", LOOP_WINDOW_CHARS - 1))).toBe(false);
});

test("the detector trips once a stream's window fills with a loop", () => {
  const detector = createRunawayDetector();
  const reply = prose(1000) + repeat("Symbol", 8000);
  let trippedAt: number | undefined;
  for (let i = 0; i < reply.length; i += 40) {
    if (detector.feed("text", reply.slice(i, i + 40))) {
      trippedAt = i + 40;
      break;
    }
  }
  // The loop starts at 1000 and fills a whole window by 5096; the next
  // judgement after that is at most 512 characters later.
  expect(trippedAt).toBeGreaterThanOrEqual(1000 + LOOP_WINDOW_CHARS);
  expect(trippedAt).toBeLessThanOrEqual(1000 + LOOP_WINDOW_CHARS + 512);
});

test("text and thinking are judged apart, and reset forgets both", () => {
  const detector = createRunawayDetector();
  // Interleaved with prose thinking, the text loop still fills its own window
  // (one shared buffer would hold half prose and never trip).
  const thinking = prose(6000);
  let tripped = false;
  for (let i = 0; i < 50 && !tripped; i++) {
    expect(
      detector.feed("thinking", thinking.slice(i * 120, i * 120 + 120)),
    ).toBe(false);
    tripped = detector.feed("text", repeat("Anchor", 120));
  }
  expect(tripped).toBe(true);
  // After a reset the loop must fill a whole window again.
  detector.reset();
  expect(detector.feed("text", repeat("Anchor", 4000))).toBe(false);
  expect(detector.feed("text", repeat("Anchor", 600))).toBe(true);
});

test("a long legit reply streamed in small deltas never trips", () => {
  const detector = createRunawayDetector();
  const reply = prose(60_000);
  for (let i = 0; i < reply.length; i += 17)
    expect(detector.feed("text", reply.slice(i, i + 17))).toBe(false);
});

test("a code block is never judged, so requested repetition survives", () => {
  const detector = createRunawayDetector();
  const square = Array.from({ length: 64 }, () => "#".repeat(64)).join("\n");
  const zeros = `[${Array.from({ length: 3000 }, () => "0").join(", ")}]`;
  const reply = `Here is your square:\n\n\`\`\`\n${square}\n\`\`\`\n\nAnd the array:\n\`\`\`json\n${zeros}\n\`\`\`\nDone.`;
  // Streamed in 7-character deltas, so fences split across them.
  for (let i = 0; i < reply.length; i += 7)
    expect(detector.feed("text", reply.slice(i, i + 7))).toBe(false);
});

test("a loop after a closed code block still trips", () => {
  const detector = createRunawayDetector();
  const reply = `\`\`\`\n${"#".repeat(5000)}\n\`\`\`\n${prose(300)}${repeat("Symbol", 6000)}`;
  let tripped = false;
  for (let i = 0; i < reply.length && !tripped; i += 5)
    tripped = detector.feed("text", reply.slice(i, i + 5));
  expect(tripped).toBe(true);
});

test("four backticks are one fence, not two", () => {
  const detector = createRunawayDetector();
  // "````" opens a block; if it counted twice, the loop inside would be judged.
  detector.feed("text", "``");
  detector.feed("text", "``\n");
  expect(detector.feed("text", repeat("#", 6000))).toBe(false);
});

/** Whether `reply`, streamed in deltas of `size`, ever trips. */
function trips(reply: string, size: number): boolean {
  const detector = createRunawayDetector();
  for (let i = 0; i < reply.length; i += size)
    if (detector.feed("text", reply.slice(i, i + size))) return true;
  return false;
}

const block = (fence: string, body: string, info = "") =>
  `${fence}${info}\n${body}\n${fence}\n`;
const art = Array.from({ length: 80 }, () => "#".repeat(64)).join("\n");

test("fences are lines of 3+ backticks or tildes, however the deltas split", () => {
  for (const size of [1, 3, 7, 64, 100_000]) {
    // Longer openers, tildes, an info string: all code blocks.
    expect(trips(`Here:\n${block("``````", art)}Done.`, size)).toBe(false);
    expect(trips(`Here:\n${block("~~~", art, "text")}Done.`, size)).toBe(false);
    expect(trips(`Here:\n${block("```", art, "json")}Done.`, size)).toBe(false);
    // A shorter run inside a longer block does not close it.
    expect(trips(`Here:\n${block("````", `\`\`\`\n${art}`)}Done.`, size)).toBe(
      false,
    );
  }
});

test("a backtick run mid-sentence opens no block, so a loop after it trips", () => {
  for (const size of [1, 5, 64]) {
    expect(
      trips(
        `Use \`\`\` to start a code block. ${prose(200)}${repeat("Symbol", 6000)}`,
        size,
      ),
    ).toBe(true);
    // Nor does inline code at the start of a line.
    expect(
      trips(`\`\`\` x \`\`\`\n${prose(200)}${repeat("Symbol", 6000)}`, size),
    ).toBe(true);
  }
});

test("a fence nested in a list item or a quote is still a fence", () => {
  const indented = art
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  const quoted = art
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  for (const size of [1, 7, 64]) {
    expect(
      trips(
        `- Example:\n\n    \`\`\`text\n${indented}\n    \`\`\`\n- Next item.\n`,
        size,
      ),
    ).toBe(false);
    expect(trips(`> \`\`\`\n${quoted}\n> \`\`\`\n`, size)).toBe(false);
  }
});

test("a fence ends with its quote or list item, so a loop after it trips", () => {
  const loop = repeat("Symbol", 6000);
  expect(trips(`> \`\`\`text\n> sample\n\n${loop}`, 7)).toBe(true);
  expect(trips(`- Example:\n\n    \`\`\`text\n    sample\n\n${loop}`, 7)).toBe(
    true,
  );
});

test("only a line in the opener's own container closes it", () => {
  // Quoted or indented backticks inside a top-level block are its content.
  const loop = repeat("Symbol", 6000);
  expect(trips(`\`\`\`text\n> \`\`\`\n${loop}\n\`\`\`\n`, 7)).toBe(false);
  expect(trips(`\`\`\`text\n    \`\`\`\n${loop}\n\`\`\`\n`, 7)).toBe(false);
  // Trailing spaces do not stop a closer, however many.
  expect(
    trips(`\`\`\`text\nsample\n\`\`\`${" ".repeat(510)}\n${loop}`, 7),
  ).toBe(true);
});

test("a line that only looks like a fence opener is judged as text", () => {
  // Inline code longer than any fence line, then a loop.
  const inline = `\`\`\`${"x".repeat(253)}\`\`\`\n`;
  expect(trips(`${inline}${prose(200)}${repeat("Symbol", 10_000)}`, 7)).toBe(
    true,
  );
  // A line that never ends is never a fence, even one that starts like it.
  expect(trips(`\n\n\`\`\`${repeat("Symbol", 10_000)}`, 7)).toBe(true);
});

test("an opener is classified before its text is judged, however it streams", () => {
  const reply = `\n\n\`\`\`text\n${art}\n\`\`\`\n`;
  for (const size of [1, 2, 3, 4, 9, 4096, 100_000])
    expect(trips(reply, size)).toBe(false);
});

test("CR and CRLF end lines too", () => {
  expect(trips(`\`\`\`\r${art.replaceAll("\n", "\r")}\r\`\`\`\r`, 5)).toBe(
    false,
  );
  expect(
    trips(`\`\`\`\r\n${art.replaceAll("\n", "\r\n")}\r\n\`\`\`\r\n`, 5),
  ).toBe(false);
});

test("a quotation inside a nested code block is content, not a quote", () => {
  const nested = art
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
  const reply = `- Example:\n  - Markdown source:\n\n      \`\`\`markdown\n      > A quotation\n${nested}\n      \`\`\`\n`;
  for (const size of [1, 7, 64]) expect(trips(reply, size)).toBe(false);
});
