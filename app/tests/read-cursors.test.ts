import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  cursorKey,
  markMentionNotified,
  markRead,
  mentionReadFloorFor,
  notifiedFloorFor,
  type ReadCursorStore,
  readFloorFor,
} from "../src/lib/read-cursors.ts";
import { mergeReadCursorStores } from "../src/lib/read-cursors-merge.ts";
import {
  type CursorStorage,
  loadReadCursors,
  pruneForeignCursorStores,
  readCursorStorageKey,
  saveReadCursors,
} from "../src/lib/read-cursors-storage.ts";

const UID = "user-me";
const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);

/** The injectable storage seam, backed by a Map instead of the DOM. Insertion
 *  order is `Map`'s, which is what `localStorage`'s index order is too. */
function memoryStorage(seed?: Record<string, string>): CursorStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** The persisted envelope, as it actually sits in storage. */
function storedBlob(
  storage: CursorStorage,
  uid: string,
): Record<string, unknown> {
  return JSON.parse(storage.getItem(readCursorStorageKey(uid)) ?? "null");
}

describe("cursorKey / readCursorStorageKey", () => {
  it("keys a conversation by agent and id", () => {
    strictEqual(cursorKey("/w/alpha", "m1"), "/w/alpha::m1");
  });

  it("scopes storage per signed-in user", () => {
    strictEqual(readCursorStorageKey(UID), "houston.read-cursors.user-me");
    ok(readCursorStorageKey("other") !== readCursorStorageKey(UID));
  });
});

describe("loadReadCursors", () => {
  it("creates a store floored at now when nothing is stored", () => {
    const store = loadReadCursors(memoryStorage(), UID, NOW);
    deepStrictEqual(store, { since: NOW, cursors: {} });
  });

  it("round-trips through saveReadCursors", () => {
    const storage = memoryStorage();
    const store: ReadCursorStore = {
      since: 1_000,
      cursors: { "/w/alpha::m1": { readAt: 2_000, notifiedAt: 3_000 } },
    };
    saveReadCursors(storage, UID, store);
    deepStrictEqual(loadReadCursors(storage, UID, NOW), store);
  });

  it("recovers from a corrupt payload with a fresh store", () => {
    const storage = memoryStorage({
      [readCursorStorageKey(UID)]: "{not json at all",
    });
    deepStrictEqual(loadReadCursors(storage, UID, NOW), {
      since: NOW,
      cursors: {},
    });
  });

  it("recovers from a foreign (non-object) payload", () => {
    const storage = memoryStorage({ [readCursorStorageKey(UID)]: "[1,2,3]" });
    deepStrictEqual(loadReadCursors(storage, UID, NOW), {
      since: NOW,
      cursors: {},
    });
  });

  it("drops individual bad rows without losing the good ones", () => {
    const storage = memoryStorage({
      [readCursorStorageKey(UID)]: JSON.stringify({
        since: "yesterday",
        cursors: {
          good: { readAt: 5_000 },
          noReadAt: { notifiedAt: 9_000 },
          notAnObject: 7,
          nanReadAt: { readAt: "soon" },
        },
      }),
    });
    deepStrictEqual(loadReadCursors(storage, UID, NOW), {
      since: NOW,
      cursors: { good: { readAt: 5_000 } },
    });
  });

  it("never reads another account's cursors", () => {
    const storage = memoryStorage();
    saveReadCursors(storage, "other", {
      since: 1,
      cursors: { "/w/alpha::m1": { readAt: 99 } },
    });
    deepStrictEqual(loadReadCursors(storage, UID, NOW).cursors, {});
  });
});

describe("read floors", () => {
  it("falls back to `since` so a fresh device does not flood", () => {
    const store = loadReadCursors(memoryStorage(), UID, NOW);
    strictEqual(readFloorFor(store, "/w/alpha::m1"), NOW);
    strictEqual(notifiedFloorFor(store, "/w/alpha::m1"), NOW);
  });

  it("prefers the conversation's own cursor", () => {
    const store: ReadCursorStore = {
      since: NOW,
      cursors: { k: { readAt: 10, notifiedAt: 20 } },
    };
    strictEqual(readFloorFor(store, "k"), 10);
    strictEqual(notifiedFloorFor(store, "k"), 20);
  });
});

describe("markRead", () => {
  it("advances the read cursor", () => {
    const store: ReadCursorStore = { since: 100, cursors: {} };
    const next = markRead(store, "k", 500);
    strictEqual(readFloorFor(next, "k"), 500);
    strictEqual(readFloorFor(store, "k"), 100);
  });

  it("returns the SAME reference when already at/after `at`", () => {
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 500 } },
    };
    strictEqual(markRead(store, "k", 500), store);
    strictEqual(markRead(store, "k", 400), store);
  });

  it("keeps the mention watermark while advancing the read cursor", () => {
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 200, notifiedAt: 300 } },
    };
    deepStrictEqual(markRead(store, "k", 900).cursors.k, {
      readAt: 900,
      notifiedAt: 300,
    });
  });
});

describe("markMentionNotified", () => {
  it("records the watermark without marking the mission read", () => {
    const store: ReadCursorStore = { since: 100, cursors: {} };
    const next = markMentionNotified(store, "k", 900);
    strictEqual(notifiedFloorFor(next, "k"), 900);
    // Seeded from `since`, so the unread badge the ping announced survives.
    strictEqual(readFloorFor(next, "k"), 100);
  });

  it("returns the SAME reference when already at/after `at`", () => {
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 200, notifiedAt: 900 } },
    };
    strictEqual(markMentionNotified(store, "k", 900), store);
    strictEqual(markMentionNotified(store, "k", 800), store);
  });

  it("advances an existing watermark and keeps readAt", () => {
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 200, notifiedAt: 300 } },
    };
    deepStrictEqual(markMentionNotified(store, "k", 1_000).cursors.k, {
      readAt: 200,
      notifiedAt: 1_000,
    });
  });
});

describe("growth cap", () => {
  it("prunes to the 500 most recently touched keys", () => {
    let store: ReadCursorStore = { since: 0, cursors: {} };
    for (let i = 0; i < 520; i++) store = markRead(store, `k${i}`, i + 1);

    const keys = Object.keys(store.cursors);
    strictEqual(keys.length, 500);
    // The 20 oldest were dropped; the newest 500 survive.
    strictEqual(store.cursors.k0, undefined);
    strictEqual(store.cursors.k19, undefined);
    strictEqual(store.cursors.k20?.readAt, 21);
    strictEqual(store.cursors.k519?.readAt, 520);
  });

  it("ranks by either watermark, so a notify-only cursor survives", () => {
    let store: ReadCursorStore = { since: 0, cursors: {} };
    store = markMentionNotified(store, "pinged", 10_000);
    for (let i = 0; i < 520; i++) store = markRead(store, `k${i}`, i + 1);
    strictEqual(store.cursors.pinged?.notifiedAt, 10_000);
    strictEqual(Object.keys(store.cursors).length, 500);
  });

  it("leaves the cursors object untouched below the cap", () => {
    const store: ReadCursorStore = { since: 0, cursors: {} };
    const next = markRead(store, "k", 1);
    strictEqual(Object.keys(next.cursors).length, 1);
  });
});

/**
 * HOU-945 review fix: opening a mission must silence its pending mention ping.
 * Both repro paths are asserted, because they fail for different reasons —
 * one is "the mention landed while I was looking", the other is "I opened the
 * mission after a reload and the mention predates that".
 */
describe("notifiedFloorFor folds in the read cursor", () => {
  it("silences a mention that lands in a conversation I have open", () => {
    // I am reading the mission: the tracker stamped `readAt` on the last
    // repaint. A mention written a moment later must not reach the OS.
    const store = markRead({ since: 100, cursors: {} }, "k", 5_000);
    strictEqual(notifiedFloorFor(store, "k"), 5_000);
    ok(4_900 <= notifiedFloorFor(store, "k"));
  });

  it("silences a mention that predates the mission I just opened", () => {
    // Fresh boot, never notified about anything here; the mention is older
    // than the moment I opened the mission, so I have already seen it.
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 9_000 } },
    };
    strictEqual(notifiedFloorFor(store, "k"), 9_000);
  });

  it("still pings for a mention newer than both watermarks", () => {
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 9_000, notifiedAt: 8_000 } },
    };
    ok(9_500 > notifiedFloorFor(store, "k"));
  });

  it("keeps the notified watermark when it leads the read cursor", () => {
    // Pinged about a mention I have not opened yet: the ping must not repeat.
    const store: ReadCursorStore = {
      since: 100,
      cursors: { k: { readAt: 200, notifiedAt: 9_000 } },
    };
    strictEqual(notifiedFloorFor(store, "k"), 9_000);
  });

  it("leaves the UNREAD badge lit for a mention I was only pinged about", () => {
    // The whole point of keeping the two watermarks separate: folding them at
    // write time would clear the badge the notification was announcing.
    const store = markMentionNotified({ since: 100, cursors: {} }, "k", 9_000);
    strictEqual(notifiedFloorFor(store, "k"), 9_000);
    ok(9_000 > mentionReadFloorFor(store, "k"));
  });
});

describe("mergeReadCursorStores", () => {
  it("takes the later of every watermark, per conversation", () => {
    const mine: ReadCursorStore = {
      since: 100,
      cursors: { a: { readAt: 500, notifiedAt: 700 }, mineOnly: { readAt: 1 } },
    };
    const theirs: ReadCursorStore = {
      since: 100,
      cursors: {
        a: { readAt: 400, notifiedAt: 900 },
        theirsOnly: { readAt: 2 },
      },
    };
    deepStrictEqual(mergeReadCursorStores(mine, theirs).cursors, {
      a: { readAt: 500, notifiedAt: 900 },
      mineOnly: { readAt: 1 },
      theirsOnly: { readAt: 2 },
    });
  });

  it("adopts a watermark the other side has and this one does not", () => {
    const merged = mergeReadCursorStores(
      { since: 100, cursors: { a: { readAt: 500 } } },
      { since: 100, cursors: { a: { readAt: 400, notifiedAt: 900 } } },
    );
    deepStrictEqual(merged.cursors.a, { readAt: 500, notifiedAt: 900 });
  });

  it("keeps the EARLIER `since`, never marking a backlog read", () => {
    const merged = mergeReadCursorStores(
      { since: 900, cursors: {} },
      { since: 100, cursors: {} },
    );
    strictEqual(merged.since, 100);
  });

  it("returns the SAME reference when the other side adds nothing", () => {
    const mine: ReadCursorStore = {
      since: 100,
      cursors: { a: { readAt: 500, notifiedAt: 700 } },
    };
    strictEqual(
      mergeReadCursorStores(mine, {
        since: 200,
        cursors: { a: { readAt: 400, notifiedAt: 600 } },
      }),
      mine,
    );
    strictEqual(mergeReadCursorStores(mine, { since: 100, cursors: {} }), mine);
  });

  it("caps a union that crosses the growth limit", () => {
    const rows = (from: number): Record<string, { readAt: number }> =>
      Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`k${from + i}`, { readAt: 1 }]),
      );
    const merged = mergeReadCursorStores(
      { since: 0, cursors: rows(0) },
      { since: 0, cursors: rows(300) },
    );
    strictEqual(Object.keys(merged.cursors).length, 500);
  });
});

/**
 * Two tabs, one blob. Every one of these fails with a plain `setItem`, which is
 * what the app did before this fix.
 */
describe("saveReadCursors merges instead of clobbering", () => {
  it("keeps what another tab wrote while this one was open", () => {
    const storage = memoryStorage();
    // The other tab read mission B and saved.
    saveReadCursors(storage, UID, {
      since: 100,
      cursors: { b: { readAt: 900 } },
    });
    // This tab still holds a view from before that, and now reads mission A.
    const merged = saveReadCursors(storage, UID, {
      since: 100,
      cursors: { a: { readAt: 800 } },
    });
    deepStrictEqual(merged.cursors, {
      a: { readAt: 800 },
      b: { readAt: 900 },
    });
    deepStrictEqual(loadReadCursors(storage, UID, NOW).cursors, merged.cursors);
  });

  it("answers the store the caller must adopt, not the one it passed", () => {
    const storage = memoryStorage();
    saveReadCursors(storage, UID, {
      since: 100,
      cursors: { b: { readAt: 9 } },
    });
    const passed: ReadCursorStore = { since: 100, cursors: {} };
    const written = saveReadCursors(storage, UID, passed);
    ok(written !== passed);
    strictEqual(written.cursors.b?.readAt, 9);
  });

  it("stamps the schema version and a lastTouched", () => {
    const storage = memoryStorage();
    saveReadCursors(
      storage,
      UID,
      { since: 100, cursors: { a: { readAt: 1 } } },
      NOW,
    );
    const blob = storedBlob(storage, UID);
    strictEqual(blob.version, 1);
    strictEqual(blob.lastTouched, NOW);
    strictEqual(blob.since, 100);
  });

  it("reads a blob that predates the version stamp", () => {
    const storage = memoryStorage({
      [readCursorStorageKey(UID)]: JSON.stringify({
        since: 100,
        cursors: { a: { readAt: 7 } },
      }),
    });
    deepStrictEqual(loadReadCursors(storage, UID, NOW), {
      since: 100,
      cursors: { a: { readAt: 7 } },
    });
  });

  it("reads a blob from a FUTURE build, field by field", () => {
    const storage = memoryStorage({
      [readCursorStorageKey(UID)]: JSON.stringify({
        version: 99,
        since: 100,
        cursors: { a: { readAt: 7 } },
        somethingWeHaveNeverHeardOf: { nested: true },
      }),
    });
    deepStrictEqual(loadReadCursors(storage, UID, NOW), {
      since: 100,
      cursors: { a: { readAt: 7 } },
    });
  });
});

describe("pruneForeignCursorStores", () => {
  /** Seed `count` other accounts, oldest first, plus unrelated origin keys. */
  function withAccounts(count: number) {
    const storage = memoryStorage({
      "houston.theme": "dark",
      "houston.query-cache": "{}",
    });
    for (let i = 0; i < count; i++) {
      saveReadCursors(
        storage,
        `other-${i}`,
        { since: 0, cursors: { a: { readAt: 1 } } },
        1_000 + i,
      );
    }
    saveReadCursors(storage, UID, { since: 0, cursors: {} }, 5);
    return storage;
  }

  it("keeps the four most recently written foreign accounts", () => {
    const storage = withAccounts(7);
    pruneForeignCursorStores(storage, UID);
    const kept = [...storage.map.keys()].filter((k) =>
      k.startsWith("houston.read-cursors."),
    );
    deepStrictEqual(
      kept.sort(),
      [
        readCursorStorageKey("other-3"),
        readCursorStorageKey("other-4"),
        readCursorStorageKey("other-5"),
        readCursorStorageKey("other-6"),
        readCursorStorageKey(UID),
      ].sort(),
    );
  });

  it("never evicts the signed-in user, however stale their stamp", () => {
    const storage = withAccounts(9);
    pruneForeignCursorStores(storage, UID);
    ok(storage.getItem(readCursorStorageKey(UID)) !== null);
  });

  it("touches nothing else in the origin", () => {
    const storage = withAccounts(9);
    pruneForeignCursorStores(storage, UID);
    strictEqual(storage.getItem("houston.theme"), "dark");
    strictEqual(storage.getItem("houston.query-cache"), "{}");
  });

  it("does nothing while the device is under the cap", () => {
    const storage = withAccounts(4);
    const before = storage.map.size;
    pruneForeignCursorStores(storage, UID);
    strictEqual(storage.map.size, before);
  });

  it("evicts an unstamped blob first, and does not throw on a corrupt one", () => {
    const storage = withAccounts(4);
    storage.setItem(readCursorStorageKey("legacy"), '{"since":1,"cursors":{}}');
    storage.setItem(readCursorStorageKey("broken"), "{not json");
    pruneForeignCursorStores(storage, UID);
    strictEqual(storage.getItem(readCursorStorageKey("legacy")), null);
    strictEqual(storage.getItem(readCursorStorageKey("broken")), null);
    ok(storage.getItem(readCursorStorageKey("other-3")) !== null);
  });
});
