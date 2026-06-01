import test from "node:test"
import assert from "node:assert/strict"
import { SessionHydrationCache } from "../src/session-hydration-cache.ts"

test("loads a never-seen session, then dedupes while in flight", () => {
  const c = new SessionHydrationCache()
  assert.equal(c.shouldLoad("routine-a"), true)
  c.begin("routine-a")
  // A second selection while the first request is still pending must not
  // fan out a duplicate fetch.
  assert.equal(c.shouldLoad("routine-a"), false)
})

test("a successful load is cached and never reloaded", () => {
  const c = new SessionHydrationCache()
  c.begin("routine-a")
  c.settle("routine-a", true)
  assert.equal(c.shouldLoad("routine-a"), false)
})

test("an empty first load stays retryable (the routine-issue bug)", () => {
  const c = new SessionHydrationCache()
  // First selection: the load starts and resolves with nothing — e.g. the
  // routine transcript was not queryable yet. The old Set-based cache kept
  // this forever and stranded the conversation blank.
  c.begin("routine-b")
  c.settle("routine-b", false)
  // Re-selecting the same routine issue must try again...
  assert.equal(c.shouldLoad("routine-b"), true)
  c.begin("routine-b")
  c.settle("routine-b", true) // ...and this time content is available.
  assert.equal(c.shouldLoad("routine-b"), false)
})

test("a failed load (settled as no content) stays retryable", () => {
  const c = new SessionHydrationCache()
  c.begin("activity-1")
  c.settle("activity-1", false) // rejection path
  assert.equal(c.shouldLoad("activity-1"), true)
})

test("distinct session keys are tracked independently", () => {
  const c = new SessionHydrationCache()
  c.begin("routine-a")
  c.settle("routine-a", true)
  assert.equal(c.shouldLoad("routine-a"), false)
  // Switching to a second routine issue is a different key and still loads.
  assert.equal(c.shouldLoad("routine-b"), true)
})

test("settle without begin is harmless and still records success", () => {
  const c = new SessionHydrationCache()
  c.settle("k", true)
  assert.equal(c.shouldLoad("k"), false)
})
