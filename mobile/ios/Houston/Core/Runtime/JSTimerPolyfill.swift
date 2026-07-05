import Foundation
import JavaScriptCore

/// Installs the four timer globals the host **must** provide (BRIDGE.md §10):
/// `setTimeout`/`clearTimeout` and `setInterval`/`clearInterval`. The SDK's
/// resume/backoff loops and idle watchdog schedule directly against these; there
/// is no pure-JS substitute in a bare engine.
///
/// All scheduling is delegated to a ``JSTimerRegistry`` armed on the JS serial
/// queue, so every callback fires on the same thread as JS execution — never
/// concurrently with it (BRIDGE.md §8).
enum JSTimerPolyfill {
    /// Define the four timer functions on the context's global object.
    ///
    /// - Parameters:
    ///   - context: the JS context (already pinned to the JS serial queue).
    ///   - registry: bookkeeping whose queue is that same serial queue.
    static func install(into context: JSContext, registry: JSTimerRegistry) {
        let setTimeout: @convention(block) (JSValue, JSValue) -> Int = { fn, ms in
            registry.schedule(afterMs: delay(ms), repeats: false) { invoke(fn) }
        }
        let setInterval: @convention(block) (JSValue, JSValue) -> Int = { fn, ms in
            registry.schedule(afterMs: delay(ms), repeats: true) { invoke(fn) }
        }
        let clearTimer: @convention(block) (JSValue) -> Void = { handle in
            guard handle.isNumber else { return } // undefined/garbage: no-op
            registry.cancel(Int(handle.toInt32()))
        }

        context.setObject(setTimeout, forKeyedSubscript: "setTimeout" as NSString)
        context.setObject(setInterval, forKeyedSubscript: "setInterval" as NSString)
        context.setObject(clearTimer, forKeyedSubscript: "clearTimeout" as NSString)
        context.setObject(clearTimer, forKeyedSubscript: "clearInterval" as NSString)
    }

    /// Coerce the `ms` argument: a missing/NaN delay behaves as `0`, like a browser.
    private static func delay(_ ms: JSValue) -> Double {
        guard ms.isNumber else { return 0 }
        let value = ms.toDouble()
        return value.isNaN ? 0 : value
    }

    /// Fire a timer callback. Runs on the JS serial queue (the registry's queue).
    private static func invoke(_ fn: JSValue) {
        guard !fn.isUndefined, !fn.isNull else { return }
        fn.call(withArguments: [])
    }
}
