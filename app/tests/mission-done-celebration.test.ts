import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  buildMissionBoardColumns,
  MISSION_APPROVE_STATUSES,
  MISSION_ARCHIVE_STATUSES,
} from "../src/components/mission-board-columns.ts";
import {
  fireMissionDoneConfetti,
  fireSetupConfetti,
  MISSION_DONE_CONFETTI_BURSTS,
  missionCardOrigin,
  SETUP_CONFETTI_BURSTS,
} from "../src/lib/confetti.ts";
import { armMissionDoneCelebration } from "../src/lib/mission-done-celebration.ts";
import {
  ARCHIVED_STATUS,
  BULK_MOVE_TARGETS,
  celebratesMissionDone,
  DONE_STATUS,
  ERROR_STATUS,
} from "../src/lib/mission-selection.ts";

/** A `confetti`-shaped spy: records every burst it is asked to fire. */
function recorder() {
  const calls: unknown[] = [];
  const fire = ((opts: unknown) => {
    calls.push(opts);
    return Promise.resolve(null);
  }) as Parameters<typeof fireMissionDoneConfetti>[1];
  return { calls, fire };
}

/** Pretend to be a browser whose OS motion preference is `reduce`/`no-preference`. */
function stubReducedMotion(reduce: boolean) {
  (globalThis as { window?: unknown }).window = {
    matchMedia: (query: string) => ({
      matches: reduce && query.includes("reduce"),
    }),
  };
}

interface StubRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pretend to be a board rendering `cards` in a 1000x800 viewport. Only the two
 *  DOM calls `missionCardOrigin` makes are stubbed. Returns the number of card
 *  lookups so far, so a test can prove WHEN the measuring happened. */
function stubBoard(
  cards: Record<string, StubRect>,
  { reduceMotion = false } = {},
) {
  const viewport = { width: 1000, height: 800 };
  (globalThis as { window?: unknown }).window = {
    matchMedia: (query: string) => ({
      matches: reduceMotion && query.includes("reduce"),
    }),
    innerWidth: viewport.width,
    innerHeight: viewport.height,
  };
  const nodes = Object.entries(cards).map(([id, rect]) => ({
    getAttribute: (name: string) =>
      name === "data-kanban-card" ? id : undefined,
    getBoundingClientRect: () => rect,
  }));
  let lookups = 0;
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: (selector: string) => {
      lookups += 1;
      return selector === "[data-kanban-card]" ? nodes : [];
    },
  };
  return { lookups: () => lookups };
}

function clearDom() {
  (globalThis as { window?: unknown }).window = undefined;
  (globalThis as { document?: unknown }).document = undefined;
}

describe("move-to-done celebration", () => {
  afterEach(clearDom);

  it("treats only `done` as the celebrated transition", () => {
    const settled = ["needs_you"];
    ok(celebratesMissionDone(DONE_STATUS, settled));
    ok(celebratesMissionDone("done", settled));
    // Every other board move is routine housekeeping, not a finish.
    ok(!celebratesMissionDone("needs_you", settled));
    ok(!celebratesMissionDone("error", settled));
    ok(!celebratesMissionDone("running", settled));
    ok(!celebratesMissionDone("archived", settled));
    ok(!celebratesMissionDone("", settled));
  });

  it("never celebrates closing a mission that FAILED", () => {
    // The checkmark and the Done column also take `error` cards — they share
    // the Needs you column — but filing a failure away is not a win.
    ok(!celebratesMissionDone(DONE_STATUS, [ERROR_STATUS]));
    ok(!celebratesMissionDone(DONE_STATUS, [ERROR_STATUS, ERROR_STATUS]));
  });

  it("celebrates a mixed bulk batch once, for the missions that landed", () => {
    // A Needs you selection can hold settled AND failed missions. The bulk bar
    // moves them in ONE act, so one nod for the batch is the honest response:
    // silencing it because a single card failed would rob all the others.
    ok(celebratesMissionDone(DONE_STATUS, [ERROR_STATUS, "needs_you"]));
    ok(celebratesMissionDone(DONE_STATUS, ["needs_you", ERROR_STATUS]));
  });

  it("stays silent when there is nothing to celebrate", () => {
    // An empty batch (nothing selected) has no mission to cheer for.
    ok(!celebratesMissionDone(DONE_STATUS, []));
  });

  it("keeps DONE_STATUS the same string the bulk bar moves to", () => {
    ok((BULK_MOVE_TARGETS as readonly string[]).includes(DONE_STATUS));
  });

  it("fires one modest burst for a finished mission", () => {
    const { calls, fire } = recorder();
    fireMissionDoneConfetti(undefined, fire);
    deepStrictEqual(calls, MISSION_DONE_CONFETTI_BURSTS);
    strictEqual(calls.length, 1);
    // Lighter than the setup payoff: finishing a mission is an everyday win.
    ok(MISSION_DONE_CONFETTI_BURSTS.length < SETUP_CONFETTI_BURSTS.length);
  });

  it("skips both celebrations when the OS asks for reduced motion", () => {
    stubReducedMotion(true);
    let fired = 0;
    const count = (() => {
      fired += 1;
      return Promise.resolve(null);
    }) as Parameters<typeof fireMissionDoneConfetti>[1];
    fireMissionDoneConfetti({ x: 0.25, y: 0.5 }, count);
    fireSetupConfetti(count);
    strictEqual(fired, 0);
  });

  it("celebrates normally when motion is allowed", () => {
    stubReducedMotion(false);
    const { calls, fire } = recorder();
    fireMissionDoneConfetti(undefined, fire);
    strictEqual(calls.length, MISSION_DONE_CONFETTI_BURSTS.length);
  });
});

describe("move-to-done celebration origin", () => {
  afterEach(clearDom);

  it("bursts from the centre of the card, in viewport fractions", () => {
    // 1000x800 viewport, card spanning x 200-440 and y 100-180: centre
    // (320, 140) -> (0.32, 0.175).
    stubBoard({ "act-1": { left: 200, top: 100, width: 240, height: 80 } });
    deepStrictEqual(missionCardOrigin("act-1"), { x: 0.32, y: 0.175 });
  });

  it("picks the card it was asked for, not merely the first one", () => {
    stubBoard({
      "act-1": { left: 0, top: 0, width: 200, height: 100 },
      "act-2": { left: 500, top: 400, width: 200, height: 100 },
    });
    deepStrictEqual(missionCardOrigin("act-2"), { x: 0.6, y: 0.5625 });
  });

  it("keeps a half-scrolled card's burst inside the viewport", () => {
    // A card whose centre sits above the top edge would launch its confetti
    // off-screen — clamped back to the edge, the payoff is still seen.
    stubBoard({ "act-1": { left: -400, top: -200, width: 240, height: 80 } });
    deepStrictEqual(missionCardOrigin("act-1"), { x: 0, y: 0 });
  });

  it("falls back to the default burst when the card is not on screen", () => {
    // The card may have been filtered out by a search, or scrolled out of a
    // virtualized column. A celebration in the generic place beats none.
    stubBoard({ "act-1": { left: 200, top: 100, width: 240, height: 80 } });
    const missing = missionCardOrigin("act-404");
    strictEqual(missing, undefined);
    const { calls, fire } = recorder();
    fireMissionDoneConfetti(missing, fire);
    deepStrictEqual(calls, MISSION_DONE_CONFETTI_BURSTS);
  });

  it("returns nothing (and never throws) without a DOM", () => {
    strictEqual(missionCardOrigin("act-1"), undefined);
  });

  it("overrides only the origin, keeping the burst's character", () => {
    const origin = { x: 0.32, y: 0.175 };
    const { calls, fire } = recorder();
    fireMissionDoneConfetti(origin, fire);
    deepStrictEqual(
      calls,
      MISSION_DONE_CONFETTI_BURSTS.map((burst) => ({ ...burst, origin })),
    );
    // The shared constants are never mutated by a card-anchored burst.
    deepStrictEqual(MISSION_DONE_CONFETTI_BURSTS[0]?.origin, {
      x: 0.5,
      y: 0.85,
    });
  });

  it("measures the card when the celebration is ARMED, not when it fires", () => {
    // The load-bearing rule of the single-card paths: after a successful move
    // the card has re-rendered into the Done column, so a lookup at fire time
    // would burst from the wrong place. Reduced motion keeps the fire step
    // inert here — this test is about WHEN the DOM is read.
    const board = stubBoard(
      { "act-1": { left: 200, top: 100, width: 240, height: 80 } },
      { reduceMotion: true },
    );
    const celebrate = armMissionDoneCelebration(
      { id: "act-1", status: "needs_you" },
      DONE_STATUS,
    );
    strictEqual(board.lookups(), 1);
    celebrate();
    strictEqual(board.lookups(), 1);
  });

  it("arms nothing, and touches no DOM, for a move that is not a finish", () => {
    // Not a finish twice over: the wrong target, and a failed mission.
    const board = stubBoard({
      "act-1": { left: 200, top: 100, width: 240, height: 80 },
    });
    armMissionDoneCelebration(
      { id: "act-1", status: "needs_you" },
      "needs_you",
    );
    armMissionDoneCelebration(
      { id: "act-1", status: ERROR_STATUS },
      DONE_STATUS,
    )();
    strictEqual(board.lookups(), 0);
  });

  it("keeps the default bottom burst for a bulk move", () => {
    // A bulk move finishes many cards at once, so `useBoardSelectionUI` passes
    // no origin: there is no ONE card the burst belongs to.
    const { calls, fire } = recorder();
    fireMissionDoneConfetti(undefined, fire);
    deepStrictEqual(calls, MISSION_DONE_CONFETTI_BURSTS);
    deepStrictEqual((calls[0] as { origin: unknown }).origin, {
      x: 0.5,
      y: 0.85,
    });
  });
});

describe("move-to-done checkmark coverage", () => {
  it("offers the checkmark on every card the Needs you column holds", () => {
    // The engine never auto-moves a mission to done, so a mission that ended
    // in `error` is just as finished as one that ended in `needs_you` — both
    // wait in the same column for the user's checkmark.
    deepStrictEqual(MISSION_APPROVE_STATUSES, ["needs_you", "error"]);
  });

  it("stays in lockstep with the Needs you column's statuses", () => {
    const columns = buildMissionBoardColumns(
      { running: "R", needsYou: "N", done: "D", newMission: "+" },
      () => {},
    );
    const needsYou = columns.find((c) => c.id === "needs_you");
    ok(needsYou);
    deepStrictEqual(MISSION_APPROVE_STATUSES, needsYou.statuses);
    // Never on a running card (nothing to sign off yet) or an already-done one.
    // Widened deliberately: the constant infers the literal union it holds, so
    // asking about a status OUTSIDE it is a compile error otherwise — which is
    // exactly the type safety this assertion exists to prove at runtime.
    const approveStatuses: readonly string[] = MISSION_APPROVE_STATUSES;
    ok(!approveStatuses.includes("running"));
    ok(!approveStatuses.includes(DONE_STATUS));
  });
});

describe("archive-box coverage", () => {
  it("offers the archive box on exactly the Done column's cards", () => {
    // The counterpart to the checkmark: once the user has signed a mission
    // off, filing it away is the only move left, and it deserves the same one
    // click that got it there.
    deepStrictEqual(MISSION_ARCHIVE_STATUSES, [DONE_STATUS]);
  });

  it("stays in lockstep with the Done column's statuses", () => {
    const columns = buildMissionBoardColumns(
      { running: "R", needsYou: "N", done: "D", newMission: "+" },
      () => {},
    );
    const done = columns.find((c) => c.id === "done");
    ok(done);
    deepStrictEqual(MISSION_ARCHIVE_STATUSES, done.statuses);
  });

  it("never offers the box on a running or a needs-you card", () => {
    // Widened deliberately, as above: the constant infers its literal union,
    // so asking about an outside status is otherwise a compile error.
    const archiveStatuses: readonly string[] = MISSION_ARCHIVE_STATUSES;
    ok(!archiveStatuses.includes("running"));
    for (const status of MISSION_APPROVE_STATUSES)
      ok(!archiveStatuses.includes(status));
  });

  it("shares no status with the checkmark", () => {
    // A card can never carry both same-weight glyphs: a mission still waiting
    // on the user has to be dealt with before it can be hidden.
    const approveStatuses: readonly string[] = MISSION_APPROVE_STATUSES;
    for (const status of MISSION_ARCHIVE_STATUSES)
      ok(!approveStatuses.includes(status));
  });

  it("writes the status that takes a mission off the active board", () => {
    // What the handler patches. `archived` is the one status with no board
    // column, so the card leaves the board and surfaces in the Archived list.
    strictEqual(ARCHIVED_STATUS, "archived");
    ok(!(BULK_MOVE_TARGETS as readonly string[]).includes(ARCHIVED_STATUS));
  });

  it("never celebrates an archive", () => {
    // The win was the checkmark; this is the tidy-up after it. Confetti here
    // would cheer the same mission twice.
    ok(!celebratesMissionDone(ARCHIVED_STATUS, [DONE_STATUS]));
    ok(!celebratesMissionDone(ARCHIVED_STATUS, ["needs_you"]));
  });

  it("arms no celebration for the archive transition", () => {
    // The handler calls no `armMissionDoneCelebration` at all; this proves the
    // shared gate would refuse it even if a future edit wired one in.
    const board = stubBoard({
      "act-1": { left: 200, top: 100, width: 240, height: 80 },
    });
    armMissionDoneCelebration(
      { id: "act-1", status: DONE_STATUS },
      ARCHIVED_STATUS,
    )();
    strictEqual(board.lookups(), 0);
    clearDom();
  });
});
