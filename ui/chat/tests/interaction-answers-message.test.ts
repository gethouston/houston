import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { decodeInteractionAnswersMessage } from "../src/interaction-answers-message.ts";

const marker = (json: string, body = "the flat body") =>
  `<!--houston:interaction-answers ${json}-->\n\n${body}`;

describe("decodeInteractionAnswersMessage", () => {
  it("decodes a valid payload of question + answer pairs", () => {
    const payload = decodeInteractionAnswersMessage(
      marker(
        JSON.stringify({
          lines: [
            { question: "To whom?", answer: "john@example.com" },
            { question: "Saying what?", answer: "Running late" },
          ],
        }),
      ),
    );
    assert.deepEqual(payload, {
      lines: [
        { question: "To whom?", answer: "john@example.com" },
        { question: "Saying what?", answer: "Running late" },
      ],
    });
  });

  it("keeps question-less lines (connected app / signin) as answer-only", () => {
    const payload = decodeInteractionAnswersMessage(
      marker(
        JSON.stringify({
          lines: [
            { question: "To whom?", answer: "john@example.com" },
            { answer: "Signed in to Houston." },
            { answer: "Connected Gmail." },
          ],
        }),
      ),
    );
    assert.deepEqual(payload, {
      lines: [
        { question: "To whom?", answer: "john@example.com" },
        { answer: "Signed in to Houston." },
        { answer: "Connected Gmail." },
      ],
    });
  });

  it("returns null for plain text with no marker", () => {
    assert.equal(decodeInteractionAnswersMessage("just a message"), null);
  });

  it("returns null for malformed marker JSON", () => {
    assert.equal(
      decodeInteractionAnswersMessage(marker("{not valid json")),
      null,
    );
  });

  it("drops individual entries missing a string answer but keeps the rest", () => {
    const payload = decodeInteractionAnswersMessage(
      marker(
        JSON.stringify({
          lines: [
            { question: "Q1", answer: "kept" },
            { question: "Q2" },
            { question: "Q3", answer: 42 },
            null,
            "nope",
            { question: 7, answer: "kept too" },
          ],
        }),
      ),
    );
    assert.deepEqual(payload, {
      lines: [{ question: "Q1", answer: "kept" }, { answer: "kept too" }],
    });
  });

  it("returns null when lines is not an array", () => {
    assert.equal(
      decodeInteractionAnswersMessage(marker(JSON.stringify({ lines: "x" }))),
      null,
    );
  });

  it("returns null when lines is empty after filtering", () => {
    assert.equal(
      decodeInteractionAnswersMessage(
        marker(JSON.stringify({ lines: [{ question: "Q" }, {}] })),
      ),
      null,
    );
  });

  it("returns null when lines is an empty array", () => {
    assert.equal(
      decodeInteractionAnswersMessage(marker(JSON.stringify({ lines: [] }))),
      null,
    );
  });
});
