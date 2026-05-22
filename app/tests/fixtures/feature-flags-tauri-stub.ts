/**
 * Test stub for `lib/tauri.ts::tauriPreferences`.
 *
 * The real `tauriPreferences` calls into the running engine over the
 * HoustonClient — we can't reach that under `node --test`. This stub
 * routes `.get()` / `.set()` through an in-memory `Map` exposed on
 * `globalThis.__test_pref_store__`, set up by the test file before
 * importing the unit under test.
 *
 * `setLog` is exposed on `globalThis.__test_set_log__` so tests can
 * assert that writes happened (or didn't) without inspecting the store
 * directly.
 *
 * This file is loaded via the `Module._resolveFilename` monkeypatch at
 * the top of `app/tests/feature-flags.test.ts`. It is NOT a public test
 * substrate; if a future test needs preference stubbing, that test
 * should install its own stub or the helpers here should move into a
 * shared `app/tests/helpers/` directory.
 */

declare global {
  // eslint-disable-next-line no-var
  var __test_pref_store__: Map<string, string | null> | undefined;
  // eslint-disable-next-line no-var
  var __test_set_log__: Array<[string, string]> | undefined;
}

function store(): Map<string, string | null> {
  if (!globalThis.__test_pref_store__) {
    throw new Error(
      "feature-flags-tauri-stub: __test_pref_store__ not initialized. " +
        "Tests must populate `globalThis.__test_pref_store__ = new Map()` " +
        "before importing the unit under test.",
    );
  }
  return globalThis.__test_pref_store__;
}

function setLog(): Array<[string, string]> {
  if (!globalThis.__test_set_log__) {
    throw new Error(
      "feature-flags-tauri-stub: __test_set_log__ not initialized.",
    );
  }
  return globalThis.__test_set_log__;
}

export const tauriPreferences = {
  get: async (key: string): Promise<string | null> => {
    const s = store();
    if (!s.has(key)) return null;
    return s.get(key) ?? null;
  },
  set: async (key: string, value: string): Promise<void> => {
    store().set(key, value);
    setLog().push([key, value]);
  },
};
