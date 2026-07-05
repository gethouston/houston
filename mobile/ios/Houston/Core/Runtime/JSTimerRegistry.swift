import Foundation

/// Pure-Swift bookkeeping for the host's `setTimeout`/`setInterval` polyfills.
///
/// Owns the id→timer map and the monotonic handle counter that JS
/// `setTimeout`/`setInterval` return and `clearTimeout`/`clearInterval` cancel.
/// Every timer is armed on **one** serial `DispatchQueue` — the same queue the
/// JavaScriptCore context runs on — so a timer callback can never fire
/// concurrently with JS execution or with another timer (BRIDGE.md §8 requires
/// the SDK's whole clock to advance on its single thread).
///
/// This type carries no JavaScriptCore dependency, so its handle allocation,
/// one-shot auto-removal, and cancel semantics are unit-testable off-device.
///
/// - Important: Every method must be invoked on `queue`. The registry does no
///   internal locking because, by contract, it is single-threaded.
final class JSTimerRegistry {
    private let queue: DispatchQueue
    private var timers: [Int: DispatchSourceTimer] = [:]
    private var nextId = 1

    /// - Parameter queue: the serial queue the JS context runs on. Timers fire here.
    init(queue: DispatchQueue) {
        self.queue = queue
    }

    /// Number of live timers. Test/diagnostic aid.
    var activeCount: Int { timers.count }

    /// Arm a timer and return its host handle.
    ///
    /// - Parameters:
    ///   - afterMs: delay before first fire, in milliseconds. Negative clamps to 0.
    ///   - repeats: `true` for `setInterval`, `false` for `setTimeout`.
    ///   - handler: fired on `queue`. For a one-shot, the handle is retired before
    ///     the handler runs, so re-entrant `clearTimeout(id)` from within is inert.
    /// - Returns: the handle JS holds; pass it to ``cancel(_:)``.
    @discardableResult
    func schedule(
        afterMs: Double,
        repeats: Bool,
        _ handler: @escaping () -> Void
    ) -> Int {
        let id = nextId
        nextId += 1

        let seconds = max(0, afterMs) / 1000.0
        let timer = DispatchSource.makeTimerSource(queue: queue)
        if repeats {
            timer.schedule(deadline: .now() + seconds, repeating: seconds)
        } else {
            timer.schedule(deadline: .now() + seconds, repeating: .never)
        }
        timer.setEventHandler { [weak self] in
            if !repeats { self?.retire(id) }
            handler()
        }
        timers[id] = timer
        timer.resume()
        return id
    }

    /// Cancel and forget the timer with `id`. Unknown ids are a no-op (idempotent,
    /// mirroring browser `clearTimeout`/`clearInterval`).
    func cancel(_ id: Int) {
        guard let timer = timers.removeValue(forKey: id) else { return }
        timer.cancel()
    }

    /// Cancel every live timer. Used on runtime teardown.
    func cancelAll() {
        for timer in timers.values { timer.cancel() }
        timers.removeAll()
    }

    /// Drop a one-shot's handle after it fires, without touching the source
    /// (it is already spent). Keeps ``activeCount`` honest.
    private func retire(_ id: Int) {
        timers.removeValue(forKey: id)
    }
}
