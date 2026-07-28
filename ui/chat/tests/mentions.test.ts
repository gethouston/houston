import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { feedItemsToMessages } from "../src/feed-to-messages.ts";
import { mentionKeyAction } from "../src/mention-keys.ts";
import { maskMarkdown } from "../src/mention-mask.ts";
import type { PendingMentions } from "../src/mention-pending.ts";
import {
  dropPending,
  MENTION_DRAFT_LIMIT,
  readPending,
  recordPending,
} from "../src/mention-pending.ts";
import {
  carryDismissal,
  filterMentionPeople,
  findMentionQuery,
  insertMention,
  isMentionListOpen,
  mentionKey,
} from "../src/mention-query.ts";
import { mentionRehypePlugin } from "../src/mention-rehype.ts";
import { resolveMentions } from "../src/mention-send.ts";
import { findMentionSpans } from "../src/mention-spans.ts";
import { mentionSpanKey } from "../src/mention-text.ts";
import type { FeedItem, MentionPerson } from "../src/types.ts";

const ADA: MentionPerson = { userId: "u_ada", name: "Ada Lovelace" };
const ADA_SHORT: MentionPerson = { userId: "u_short", name: "Ada" };
const JOSE: MentionPerson = { userId: "u_jose", name: "José" };
const BOB: MentionPerson = { userId: "u_bob", name: "Bob Ross" };
const ROSTER = [ADA, ADA_SHORT, JOSE, BOB];

/** "José" the two ways Unicode spells it: one precomposed character, or
 *  "e" plus a combining acute. A reader sees no difference; `.length` does. */
const JOSE_NFC = "Jos\u00e9";
const JOSE_NFD = "Jose\u0301";

describe("mentionKey", () => {
  it("folds case and diacritics — it is the FILTER key", () => {
    assert.equal(mentionKey("José"), "jose");
    assert.equal(mentionKey("ÅNGSTRÖM"), "angstrom");
  });
});

describe("mentionSpanKey", () => {
  it("folds case but NOT diacritics, and normalizes to NFC", () => {
    assert.equal(mentionSpanKey(JOSE_NFD), "jos\u00e9");
    assert.notEqual(mentionSpanKey(JOSE_NFC), mentionSpanKey("Jose"));
    assert.equal(mentionSpanKey(JOSE_NFD), mentionSpanKey(JOSE_NFC));
    assert.equal(mentionSpanKey(JOSE_NFD).length, JOSE_NFC.length);
  });
});

describe("findMentionQuery", () => {
  it("detects an @ at the start of the text", () => {
    assert.deepEqual(findMentionQuery("@Ad", 3), { start: 0, query: "Ad" });
  });

  it("detects an @ after whitespace and after an opening bracket", () => {
    assert.deepEqual(findMentionQuery("hey @Ad", 7), { start: 4, query: "Ad" });
    assert.deepEqual(findMentionQuery("(@Ad", 4), { start: 1, query: "Ad" });
  });

  it("opens on a bare @ so the whole roster is offered", () => {
    assert.deepEqual(findMentionQuery("hey @", 5), { start: 4, query: "" });
  });

  it("does NOT trigger on an @ mid-word", () => {
    assert.equal(findMentionQuery("she said hi@Ad", 14), null);
  });

  it("does NOT trigger inside an email address", () => {
    assert.equal(findMentionQuery("write ada@example.com", 21), null);
  });

  it("keeps matching across ONE interior space", () => {
    assert.deepEqual(findMentionQuery("hi @Ada Lo", 10), {
      start: 3,
      query: "Ada Lo",
    });
  });

  it("stops on a double space, a leading space, or a newline", () => {
    assert.equal(findMentionQuery("hi @Ada  Lo", 11), null);
    assert.equal(findMentionQuery("hi @ Ada", 8), null);
    assert.equal(findMentionQuery("hi @\nAda", 8), null);
  });

  it("closes on the trailing space an accepted pick leaves behind", () => {
    const { text, caret } = insertMention("hi @Ad", 3, 6, ADA);
    assert.equal(text, "hi @Ada Lovelace ");
    assert.equal(findMentionQuery(text, caret), null);
  });

  it("closes past the length cap", () => {
    assert.equal(findMentionQuery(`@${"a".repeat(33)}`, 34), null);
  });

  it("reads the query at the CARET, not at the end of the text", () => {
    assert.deepEqual(findMentionQuery("@Ad and more", 3), {
      start: 0,
      query: "Ad",
    });
  });
});

describe("filterMentionPeople", () => {
  it("returns everyone, in roster order, for an empty query", () => {
    assert.deepEqual(
      filterMentionPeople(ROSTER, "").map((p) => p.userId),
      ["u_ada", "u_short", "u_jose", "u_bob"],
    );
  });

  it("matches a prefix of the full name, ignoring case", () => {
    assert.deepEqual(
      filterMentionPeople(ROSTER, "ada l").map((p) => p.userId),
      ["u_ada"],
    );
  });

  it("matches a prefix of ANY word in the name", () => {
    assert.deepEqual(
      filterMentionPeople(ROSTER, "ross").map((p) => p.userId),
      ["u_bob"],
    );
  });

  it("matches across diacritics in both directions", () => {
    assert.deepEqual(
      filterMentionPeople(ROSTER, "jos").map((p) => p.userId),
      ["u_jose"],
    );
    assert.deepEqual(
      filterMentionPeople([{ userId: "u", name: "Jose" }], "José").map(
        (p) => p.userId,
      ),
      ["u"],
    );
  });

  it("caps the list at the suggestion limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      userId: `u${i}`,
      name: `Person ${i}`,
    }));
    assert.equal(filterMentionPeople(many, "").length, 6);
  });

  it("returns nothing when no one matches", () => {
    assert.deepEqual(filterMentionPeople(ROSTER, "zzz"), []);
  });
});

describe("insertMention", () => {
  it("replaces the query span with '@Name ' and puts the caret after it", () => {
    const result = insertMention("hey @Ad", 4, 7, ADA);
    assert.equal(result.text, "hey @Ada Lovelace ");
    assert.equal(result.caret, result.text.length);
  });

  it("keeps the text that follows the caret", () => {
    const result = insertMention("hey @Ad and Bob", 4, 7, ADA);
    assert.equal(result.text, "hey @Ada Lovelace and Bob");
    assert.equal(result.caret, "hey @Ada Lovelace ".length);
  });

  it("adds NO trailing space before punctuation", () => {
    const result = insertMention("hey @Ad, thanks", 4, 7, ADA);
    assert.equal(result.text, "hey @Ada Lovelace, thanks");
    assert.equal(result.caret, "hey @Ada Lovelace".length);
    for (const punctuation of [".", "!", "?", ")", ":", "…"]) {
      const { text } = insertMention(`@Ad${punctuation}`, 0, 3, ADA_SHORT);
      assert.equal(text, `@Ada${punctuation}`);
    }
  });

  it("adds NO trailing space before a newline either", () => {
    const result = insertMention("@Ad\nnext line", 0, 3, ADA_SHORT);
    assert.equal(result.text, "@Ada\nnext line");
    assert.equal(result.caret, "@Ada".length);
  });

  it("reuses an existing trailing space instead of stacking a second", () => {
    const result = insertMention("hey @Ad ok", 4, 7, ADA);
    assert.equal(result.text, "hey @Ada Lovelace ok");
    assert.equal(result.caret, "hey @Ada Lovelace ".length);
  });

  it("round-trips: what it inserts, findMentionSpans finds back", () => {
    const { text } = insertMention("hey @Ad", 4, 7, ADA);
    const spans = findMentionSpans(text, [
      { name: ADA.name, userId: ADA.userId },
    ]);
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.start, 4);
    assert.equal(spans[0]?.end, 4 + 1 + ADA.name.length);
    assert.equal(text.slice(spans[0]?.start, spans[0]?.end), "@Ada Lovelace");
    assert.equal(spans[0]?.target.userId, "u_ada");
  });
});

describe("findMentionSpans", () => {
  const targets = [
    { name: "Ada", userId: "u_short" },
    { name: "Ada Lovelace", userId: "u_ada" },
  ];

  it("prefers the LONGEST matching name", () => {
    const spans = findMentionSpans("ping @Ada Lovelace please", targets);
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.target.userId, "u_ada");
    assert.equal(spans[0]?.end, "ping @Ada Lovelace".length);
  });

  it("still matches the short name on its own", () => {
    const spans = findMentionSpans("ping @Ada please", targets);
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.target.userId, "u_short");
  });

  it("does not match a name that runs into a longer word", () => {
    assert.deepEqual(findMentionSpans("ping @Adam please", targets), []);
  });

  it("does not match an @ mid-word or inside an email address", () => {
    assert.deepEqual(findMentionSpans("mail ada@Ada.com", targets), []);
    assert.deepEqual(findMentionSpans("x@Ada", targets), []);
  });

  it("finds several non-overlapping spans in order", () => {
    const spans = findMentionSpans("@Ada and @Bob Ross", [
      ...targets,
      { name: "Bob Ross", userId: "u_bob" },
    ]);
    assert.deepEqual(
      spans.map((s) => s.target.userId),
      ["u_short", "u_bob"],
    );
    assert.ok((spans[0]?.end ?? 0) <= (spans[1]?.start ?? 0));
  });

  it("ignores case", () => {
    const spans = findMentionSpans("hola @JOS\u00c9", [
      { name: JOSE_NFC, userId: "u_jose" },
    ]);
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.target.userId, "u_jose");
  });

  it("does NOT chip a differently accented spelling — that is a different name", () => {
    assert.deepEqual(
      findMentionSpans("hola @jose", [{ name: JOSE_NFC, userId: "u_jose" }]),
      [],
    );
  });
});

describe("findMentionSpans — Unicode normalization", () => {
  const at = (text: string, span: { start: number; end: number }) =>
    text.normalize("NFC").slice(span.start, span.end);

  it("chips when the ROSTER name is NFD and the text is NFC", () => {
    const text = `hola @${JOSE_NFC}, ¿todo bien?`;
    const spans = findMentionSpans(text, [
      { name: JOSE_NFD, userId: "u_jose" },
    ]);
    assert.equal(spans.length, 1);
    assert.equal(at(text, spans[0] as { start: number; end: number }), "@José");
    assert.equal(spans[0]?.target.userId, "u_jose");
  });

  it("chips when the ROSTER name is NFC and the text is NFD", () => {
    const text = `hola @${JOSE_NFD}, ¿todo bien?`;
    const spans = findMentionSpans(text, [
      { name: JOSE_NFC, userId: "u_jose" },
    ]);
    assert.equal(spans.length, 1);
    // The offsets index the NFC form, where the accent is part of the name —
    // the bug this guards is a span that ended one unit short and leaked the
    // combining accent into the text node after the chip.
    assert.equal(at(text, spans[0] as { start: number; end: number }), "@José");
  });

  it("never truncates mid-grapheme: a floating accent is not a match at all", () => {
    // "@Ana" + a combining acute composes to "@Aná", which is somebody else.
    const spans = findMentionSpans("hi @Ana\u0301 there", [
      { name: "Ana", userId: "u_ana" },
    ]);
    assert.deepEqual(spans, []);
  });

  it("reports the name in NFC, whichever form the roster used", () => {
    const spans = findMentionSpans(`@${JOSE_NFC}`, [{ name: JOSE_NFD }]);
    assert.equal(spans[0]?.target.name, JOSE_NFC);
  });
});

describe("findMentionSpans — two people, one name", () => {
  const anas = [
    { name: "Ana", userId: "u_a1" },
    { name: "Ana", userId: "u_a2", isSelf: true },
  ];

  it("collapses them into ONE target: the text cannot say which Ana", () => {
    const spans = findMentionSpans("@Ana and @Ana", anas);
    assert.equal(spans.length, 2);
    assert.deepEqual(
      spans.map((s) => s.target.userId),
      ["u_a1", "u_a1"],
    );
  });

  it("emphasizes the mention when ANY same-name entry is the viewer", () => {
    // The viewer sorted second; dropping their flag would silently
    // un-address the person reading the message.
    const spans = findMentionSpans("@Ana", anas);
    assert.equal(spans[0]?.target.isSelf, true);
  });
});

describe("maskMarkdown", () => {
  const masked = (text: string) => maskMarkdown(text);

  it("blanks a fenced code block, preserving length and newlines", () => {
    const text = "before\n```js\n@Ada Lovelace\n```\nafter";
    const out = masked(text);
    assert.equal(out.length, text.length);
    assert.equal(out.split("\n").length, text.split("\n").length);
    assert.ok(out.startsWith("before\n"));
    assert.ok(out.endsWith("\nafter"));
    assert.ok(!out.includes("@Ada"));
  });

  it("blanks an unterminated fence to the end of the text", () => {
    const out = masked("hi\n```\n@Ada Lovelace");
    assert.ok(!out.includes("@Ada"));
    assert.ok(out.startsWith("hi\n"));
  });

  it("blanks an inline code span", () => {
    const text = "run `ping @Ada Lovelace` first";
    const out = masked(text);
    assert.equal(out.length, text.length);
    assert.ok(!out.includes("@Ada"));
    assert.ok(out.startsWith("run "));
    assert.ok(out.endsWith(" first"));
  });

  it("blanks a markdown link, label and destination alike", () => {
    const text = "see [@Ada Lovelace](https://x/@Bob Ross) ok";
    const out = masked(text);
    assert.equal(out.length, text.length);
    assert.ok(!out.includes("@Ada"));
    assert.ok(!out.includes("@Bob"));
    assert.ok(out.endsWith(" ok"));
  });

  it("leaves ordinary prose exactly as it is", () => {
    const text = "thanks @Ada Lovelace, that helped";
    assert.equal(masked(text), text);
  });
});

describe("resolveMentions", () => {
  const pending = [
    { userId: "u_ada", name: "Ada Lovelace" },
    { userId: "u_bob", name: "Bob Ross" },
  ];

  it("keeps only the mentions whose text survived", () => {
    assert.deepEqual(resolveMentions("thanks @Ada Lovelace!", pending), [
      { userId: "u_ada", name: "Ada Lovelace" },
    ]);
  });

  it("drops everything when the text was deleted", () => {
    assert.deepEqual(resolveMentions("thanks!", pending), []);
  });

  it("dedupes by userId even when the name appears twice", () => {
    assert.deepEqual(
      resolveMentions("@Ada Lovelace and @Ada Lovelace", [
        ...pending,
        { userId: "u_ada", name: "Ada Lovelace" },
      ]),
      [{ userId: "u_ada", name: "Ada Lovelace" }],
    );
  });

  it("drops a pending entry with no name (it can never be matched)", () => {
    assert.deepEqual(resolveMentions("@Ada Lovelace", [{ userId: "u_x" }]), []);
  });

  it("does not resolve a mention that only appears inside a longer word", () => {
    assert.deepEqual(resolveMentions("mail ada@Ada Lovelace", pending), []);
  });

  it("records nothing for a name the RENDERER would never chip", () => {
    // Each of these renders as verbatim content, so a chip never appears —
    // recording the mention would notify someone about a message that
    // addresses them nowhere.
    assert.deepEqual(resolveMentions("run `@Ada Lovelace`", pending), []);
    assert.deepEqual(resolveMentions("```\n@Ada Lovelace\n```", pending), []);
    assert.deepEqual(
      resolveMentions("see [@Ada Lovelace](https://x)", pending),
      [],
    );
    // …and the same name OUTSIDE the code span still ships.
    assert.deepEqual(resolveMentions("run `x` @Ada Lovelace", pending), [
      { userId: "u_ada", name: "Ada Lovelace" },
    ]);
  });
});

describe("resolveMentions — two teammates called Ana", () => {
  const ANA1 = { userId: "u_a1", name: "Ana" };
  const ANA2 = { userId: "u_a2", name: "Ana" };

  it("ships the Ana the user actually picked, not the first in the roster", () => {
    assert.deepEqual(resolveMentions("hi @Ana", [ANA2]), [ANA2]);
  });

  it("hands occurrences to picks in order: first @Ana, second @Ana", () => {
    assert.deepEqual(resolveMentions("@Ana and @Ana", [ANA1, ANA2]), [
      ANA1,
      ANA2,
    ]);
  });

  it("attributes a single occurrence to the first pick made under the name", () => {
    assert.deepEqual(resolveMentions("just @Ana", [ANA1, ANA2]), [ANA1]);
  });

  it("repeats the first pick past the number of people picked", () => {
    assert.deepEqual(resolveMentions("@Ana @Ana @Ana", [ANA2]), [ANA2]);
  });
});

describe("mentionKeyAction", () => {
  const press = (name: string, over: Partial<{ shiftKey: boolean }> = {}) => ({
    key: name,
    shiftKey: false,
    isComposing: false,
    ...over,
  });

  it("navigates, dismisses and accepts", () => {
    assert.deepEqual(mentionKeyAction(press("ArrowDown"), 3), {
      kind: "move",
      step: 1,
    });
    assert.deepEqual(mentionKeyAction(press("ArrowUp"), 3), {
      kind: "move",
      step: 2,
    });
    assert.deepEqual(mentionKeyAction(press("Escape"), 3), { kind: "dismiss" });
    assert.deepEqual(mentionKeyAction(press("Enter"), 3), { kind: "accept" });
    assert.deepEqual(mentionKeyAction(press("Tab"), 3), { kind: "accept" });
  });

  it("takes NOTHING while an IME composition is in flight", () => {
    for (const name of ["ArrowDown", "ArrowUp", "Escape", "Enter", "Tab"]) {
      assert.equal(
        mentionKeyAction({ key: name, shiftKey: false, isComposing: true }, 3),
        null,
        `${name} must belong to the IME candidate window`,
      );
    }
  });

  it("leaves Shift+Enter, plain keys and an empty list alone", () => {
    assert.equal(mentionKeyAction(press("Enter", { shiftKey: true }), 3), null);
    assert.equal(mentionKeyAction(press("a"), 3), null);
    assert.equal(mentionKeyAction(press("Enter"), 0), null);
  });
});

describe("the dismissal state machine", () => {
  const open = (over: Partial<Parameters<typeof isMentionListOpen>[0]>) =>
    isMentionListOpen({
      enabled: true,
      suggestionCount: 2,
      active: { start: 4, query: "Ad" },
      dismissedStart: null,
      ...over,
    });

  it("is open on an active query with candidates", () => {
    assert.equal(open({}), true);
  });

  it("is shut with no query, no candidates, or while disabled", () => {
    assert.equal(open({ active: null }), false);
    assert.equal(open({ suggestionCount: 0 }), false);
    assert.equal(open({ enabled: false }), false);
  });

  it("STAYS shut for the rest of the token after a dismissal", () => {
    // Escape at "@Ad", then one more character typed: same token, same start.
    assert.equal(open({ dismissedStart: 4 }), false);
    assert.equal(
      open({ dismissedStart: 4, active: { start: 4, query: "Ada" } }),
      false,
    );
  });

  it("opens again for a NEW token", () => {
    assert.equal(
      open({ dismissedStart: 4, active: { start: 12, query: "Bo" } }),
      true,
    );
  });

  it("lifts the dismissal only when the token itself is gone", () => {
    // Still inside the token: kept.
    assert.equal(carryDismissal(4, { start: 4, query: "Ada" }), 4);
    // The "@" was deleted / the caret left / it stopped being a name.
    assert.equal(carryDismissal(4, null), null);
  });
});

describe("pending mentions are scoped per draft", () => {
  const A = "activity-a";
  const B = "activity-b";
  const ADA_PICK = { userId: "u_ada", name: "Ada Lovelace" };
  const BOB_PICK = { userId: "u_bob", name: "Bob Ross" };

  it("keeps one conversation's picks out of another's send", () => {
    const drafts: PendingMentions = new Map();
    recordPending(drafts, A, ADA_PICK);
    assert.deepEqual(readPending(drafts, B), []);
    assert.deepEqual(
      resolveMentions("hi @Ada Lovelace", readPending(drafts, B)),
      [],
    );
  });

  it("survives switching away and back", () => {
    const drafts: PendingMentions = new Map();
    recordPending(drafts, A, ADA_PICK);
    recordPending(drafts, B, BOB_PICK);
    assert.deepEqual(readPending(drafts, A), [ADA_PICK]);
    assert.deepEqual(
      resolveMentions("hi @Ada Lovelace", readPending(drafts, A)),
      [ADA_PICK],
    );
  });

  it("ignores a person already parked in the same draft", () => {
    const drafts: PendingMentions = new Map();
    recordPending(drafts, A, ADA_PICK);
    recordPending(drafts, A, ADA_PICK);
    assert.deepEqual(readPending(drafts, A), [ADA_PICK]);
  });

  it("drops only the draft that was sent", () => {
    const drafts: PendingMentions = new Map();
    recordPending(drafts, A, ADA_PICK);
    recordPending(drafts, B, BOB_PICK);
    dropPending(drafts, A);
    assert.deepEqual(readPending(drafts, A), []);
    assert.deepEqual(readPending(drafts, B), [BOB_PICK]);
  });

  it("evicts the least recently touched draft past the cap", () => {
    const drafts: PendingMentions = new Map();
    recordPending(drafts, "oldest", ADA_PICK);
    for (let i = 0; i < MENTION_DRAFT_LIMIT; i += 1) {
      recordPending(drafts, `draft-${i}`, BOB_PICK);
    }
    assert.equal(drafts.size, MENTION_DRAFT_LIMIT);
    assert.deepEqual(readPending(drafts, "oldest"), []);
  });

  it("a FAILED send keeps the picks; only a landed one drops them", async () => {
    // Mirrors `chat-input.tsx`'s ordering: resolve, await onSend, then commit.
    const drafts: PendingMentions = new Map();
    recordPending(drafts, A, ADA_PICK);
    const send = async (accepted: boolean) => {
      const mentions = resolveMentions(
        "hi @Ada Lovelace",
        readPending(drafts, A),
      );
      if (!accepted) throw new Error("network down");
      dropPending(drafts, A);
      return mentions;
    };

    await assert.rejects(() => send(false));
    // The text is still in the composer, so the retry must still carry Ada.
    assert.deepEqual(readPending(drafts, A), [ADA_PICK]);
    assert.deepEqual(await send(true), [ADA_PICK]);
    assert.deepEqual(readPending(drafts, A), []);
  });
});

describe("mentionRehypePlugin", () => {
  const targets = [{ name: "Ada", userId: "u_short", isSelf: true }];
  const run = (tree: unknown, list = targets) => {
    mentionRehypePlugin({ targets: list })(tree);
    return tree;
  };
  const paragraph = (...children: unknown[]) => ({
    type: "root",
    children: [{ type: "element", tagName: "p", children }],
  });
  type Node = { type: string; tagName?: string; value?: string };
  const kids = (tree: unknown): Node[] =>
    (tree as { children: { children: Node[] }[] }).children[0]
      ?.children as Node[];

  it("splits a text node around the mention", () => {
    const tree = run(paragraph({ type: "text", value: "hi @Ada ok" }));
    assert.deepEqual(
      kids(tree).map((n) => n.value ?? n.tagName),
      ["hi ", "span", " ok"],
    );
  });

  it("marks the span with the name and the self flag", () => {
    const tree = run(paragraph({ type: "text", value: "@Ada" }));
    const span = kids(tree)[0] as { properties: Record<string, unknown> };
    assert.equal(span.properties["data-mention-name"], "Ada");
    assert.equal(span.properties["data-mention-self"], "");
  });

  it("never chips inside code, pre or link text", () => {
    for (const tagName of ["code", "pre", "a"]) {
      const tree = run(
        paragraph({
          type: "element",
          tagName,
          children: [{ type: "text", value: "@Ada" }],
        }),
      );
      const inner = (kids(tree)[0] as { children: Node[] }).children;
      assert.equal(inner.length, 1);
      assert.equal(inner[0]?.type, "text");
    }
  });

  it("chips an NFD name written in NFC prose, whole grapheme and all", () => {
    const tree = run(paragraph({ type: "text", value: `hola @${JOSE_NFC}!` }), [
      { name: JOSE_NFD, userId: "u_jose" },
    ]);
    const nodes = kids(tree);
    assert.deepEqual(
      nodes.map((n) => n.value ?? n.tagName),
      ["hola ", "span", "!"],
    );
    const chip = nodes[1] as unknown as { children: Node[] };
    assert.equal(chip.children[0]?.value, `@${JOSE_NFC}`);
  });

  it("leaves a mention-free tree untouched", () => {
    const tree = run(paragraph({ type: "text", value: "nothing here" }));
    assert.deepEqual(
      kids(tree).map((n) => n.value),
      ["nothing here"],
    );
  });
});

describe("feedItemsToMessages", () => {
  it("carries a user message's mentions through to the ChatMessage", () => {
    const items: FeedItem[] = [
      {
        feed_type: "user_message",
        data: "ping @Ada Lovelace",
        mentions: [{ userId: "u_ada", name: "Ada Lovelace" }],
      },
    ];
    const [message] = feedItemsToMessages(items);
    assert.deepEqual(message?.mentions, [
      { userId: "u_ada", name: "Ada Lovelace" },
    ]);
  });

  it("leaves mentions absent when the feed item carries none", () => {
    const [message] = feedItemsToMessages([
      { feed_type: "user_message", data: "hello" },
    ]);
    assert.equal(message?.mentions, undefined);
  });
});
