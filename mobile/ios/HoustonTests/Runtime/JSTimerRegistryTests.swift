import XCTest
@testable import Houston

/// Pure-Swift bookkeeping tests for the timer polyfill. No JavaScriptCore needed:
/// a real serial `DispatchQueue` stands in for the JS queue.
final class JSTimerRegistryTests: XCTestCase {
    private func makeQueue() -> DispatchQueue {
        DispatchQueue(label: "test.js.timers")
    }

    func testHandlesAreMonotonicAndDistinct() {
        let queue = makeQueue()
        let registry = JSTimerRegistry(queue: queue)
        queue.sync {
            let a = registry.schedule(afterMs: 10_000, repeats: false) {}
            let b = registry.schedule(afterMs: 10_000, repeats: false) {}
            let c = registry.schedule(afterMs: 10_000, repeats: true) {}
            XCTAssertLessThan(a, b)
            XCTAssertLessThan(b, c)
            XCTAssertEqual(registry.activeCount, 3)
        }
    }

    func testOneShotFiresOnceThenRetires() {
        let queue = makeQueue()
        let registry = JSTimerRegistry(queue: queue)
        let fired = expectation(description: "one-shot fired")
        var count = 0
        queue.sync {
            // Discard the handle so the closure (and thus `sync`) returns Void;
            // `@discardableResult` doesn't cover a value flowing out via `sync`.
            _ = registry.schedule(afterMs: 5, repeats: false) {
                count += 1
                fired.fulfill()
            }
        }
        wait(for: [fired], timeout: 1)
        queue.sync {
            XCTAssertEqual(count, 1)
            XCTAssertEqual(registry.activeCount, 0, "one-shot must retire its handle")
        }
    }

    func testIntervalRepeatsUntilCancelled() {
        let queue = makeQueue()
        let registry = JSTimerRegistry(queue: queue)
        let threeTicks = expectation(description: "interval ticked 3x")
        var id = 0
        var count = 0
        queue.sync {
            id = registry.schedule(afterMs: 5, repeats: true) {
                count += 1
                if count == 3 {
                    registry.cancel(id)
                    threeTicks.fulfill()
                }
            }
        }
        wait(for: [threeTicks], timeout: 1)
        queue.sync {
            XCTAssertEqual(count, 3)
            XCTAssertEqual(registry.activeCount, 0, "cancel must retire the interval")
        }
    }

    func testCancelBeforeFirePreventsCallback() {
        let queue = makeQueue()
        let registry = JSTimerRegistry(queue: queue)
        var fired = false
        queue.sync {
            let id = registry.schedule(afterMs: 50, repeats: false) { fired = true }
            registry.cancel(id)
            XCTAssertEqual(registry.activeCount, 0)
        }
        let settled = expectation(description: "past the deadline")
        queue.asyncAfter(deadline: .now() + 0.15) { settled.fulfill() }
        wait(for: [settled], timeout: 1)
        queue.sync { XCTAssertFalse(fired, "cancelled timer must not fire") }
    }

    func testCancelUnknownIdIsNoOp() {
        let queue = makeQueue()
        let registry = JSTimerRegistry(queue: queue)
        queue.sync {
            registry.cancel(999) // must not crash
            XCTAssertEqual(registry.activeCount, 0)
        }
    }

    func testCancelAllClearsEverything() {
        let queue = makeQueue()
        let registry = JSTimerRegistry(queue: queue)
        queue.sync {
            registry.schedule(afterMs: 10_000, repeats: true) {}
            registry.schedule(afterMs: 10_000, repeats: false) {}
            XCTAssertEqual(registry.activeCount, 2)
            registry.cancelAll()
            XCTAssertEqual(registry.activeCount, 0)
        }
    }
}
