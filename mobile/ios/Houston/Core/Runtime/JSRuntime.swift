import Foundation
import JavaScriptCore

/// The JavaScriptCore host for `@houston/sdk`.
///
/// Loads the bundled `houston-sdk.bridge.js`, installs the host polyfills the
/// bare engine needs (BRIDGE.md §10), calls `HoustonSdkBridge.create({ send })`,
/// and exposes `receive(_:)` — the two-primitive string pipe of BRIDGE.md §1.
/// It knows nothing about command/scope semantics; it only marshals whole JSON
/// strings across the pipe. ``SdkClient`` layers the typed contract on top.
///
/// ## Threading
/// All JavaScriptCore work runs on **one dedicated serial `DispatchQueue`**, not
/// an `actor` and not the main thread. Rationale:
/// - JSC forbids *concurrent* access to a context; a serial queue executes its
///   blocks strictly one at a time, so the context is never touched re-entrantly
///   or in parallel (BRIDGE.md §8: "one JS thread").
/// - Timers **must** fire on the same execution context as JS (BRIDGE.md §10);
///   arming `DispatchSourceTimer`s on this exact queue guarantees a timer callback
///   is serialized with `receive`/`send`/handlers — no races, no locks.
/// - A Swift `actor` was rejected: actors hop across the cooperative thread pool
///   between suspension points, which gives no stable thread for JSC's affinity
///   and no way to co-schedule timers on "the JS thread". A pinned serial queue
///   is the precise primitive the contract asks for.
///
/// The `onSend`/`onFatal` callbacks are invoked **on the JS queue**. Per BRIDGE.md
/// §8 the owner's `onSend` must only marshal the string and return (e.g. hop to
/// `@MainActor`); it must not re-enter ``receive(_:)`` synchronously.
final class JSRuntime {
    private let queue: DispatchQueue
    private var context: JSContext?
    private var bridge: JSValue?
    private var registry: JSTimerRegistry?
    private var sendHandler: ((String) -> Void)?
    private var fatalHandler: ((JSRuntimeError) -> Void)?
    private var disposed = false

    /// The app-bundle resource name (without extension) of the SDK bundle.
    static let bundleResourceName = "houston-sdk.bridge"
    private static let bundleResourceExt = "js"

    init(queueLabel: String = "ai.houston.js") {
        queue = DispatchQueue(label: queueLabel, qos: .userInitiated)
    }

    // MARK: - Loading

    /// Load the SDK bundle from the app bundle and construct the bridge.
    ///
    /// - Parameters:
    ///   - bundle: bundle holding `houston-sdk.bridge.js` (default `.main`).
    ///   - onSend: outbound SDK→host messages, invoked on the JS queue.
    ///   - onFatal: uncaught JS/host exceptions, invoked on the JS queue.
    /// - Throws: ``JSRuntimeError`` if the resource is missing, unreadable, or
    ///   the bundle fails to evaluate / expose `HoustonSdkBridge`.
    func load(
        from bundle: Bundle = .main,
        onSend: @escaping (String) -> Void,
        onFatal: @escaping (JSRuntimeError) -> Void
    ) throws {
        guard let url = bundle.url(
            forResource: Self.bundleResourceName,
            withExtension: Self.bundleResourceExt
        ) else {
            throw JSRuntimeError.bundleResourceMissing(
                name: "\(Self.bundleResourceName).\(Self.bundleResourceExt)"
            )
        }
        try load(bundleURL: url, onSend: onSend, onFatal: onFatal)
    }

    /// Load the SDK bundle from an explicit file URL (used by tests/tools).
    func load(
        bundleURL: URL,
        onSend: @escaping (String) -> Void,
        onFatal: @escaping (JSRuntimeError) -> Void
    ) throws {
        let source: String
        do {
            source = try String(contentsOf: bundleURL, encoding: .utf8)
        } catch {
            throw JSRuntimeError.bundleUnreadable(underlying: String(describing: error))
        }
        try queue.sync { try setUp(source: source, onSend: onSend, onFatal: onFatal) }
    }

    /// Build the context, install polyfills, evaluate the bundle, create the
    /// bridge. Runs on the JS queue. Setup-time JS exceptions surface as thrown
    /// ``JSRuntimeError``s (not the async fatal path) so the caller sees them.
    private func setUp(
        source: String,
        onSend: @escaping (String) -> Void,
        onFatal: @escaping (JSRuntimeError) -> Void
    ) throws {
        guard context == nil else { return }
        guard let context = JSContext() else {
            throw JSRuntimeError.evaluationFailed(message: "JSContext allocation failed")
        }
        sendHandler = onSend
        fatalHandler = onFatal

        var setupException: String?
        context.exceptionHandler = { _, exc in setupException = exc?.toString() }

        let registry = JSTimerRegistry(queue: queue)
        JSConsolePolyfill.install(into: context)
        JSCryptoPolyfill.install(into: context)
        JSTimerPolyfill.install(into: context, registry: registry)

        let send: @convention(block) (String) -> Void = { [weak self] message in
            self?.sendHandler?(message) // already on the JS queue
        }
        context.setObject(send, forKeyedSubscript: "__houstonSend" as NSString)

        context.evaluateScript(source)
        if let setupException {
            throw JSRuntimeError.evaluationFailed(message: setupException)
        }
        guard let bridgeGlobal = context.objectForKeyedSubscript("HoustonSdkBridge"),
              !bridgeGlobal.isUndefined, !bridgeGlobal.isNull else {
            throw JSRuntimeError.bridgeGlobalMissing
        }
        let bridge = context.evaluateScript("HoustonSdkBridge.create({ send: __houstonSend })")
        if let setupException {
            throw JSRuntimeError.bridgeCreateFailed(message: setupException)
        }
        guard let bridge, bridge.isObject else {
            throw JSRuntimeError.bridgeCreateFailed(message: "create returned no object")
        }

        context.exceptionHandler = { [weak self] _, exc in
            let message = exc?.toString() ?? "unknown"
            JSRuntimeLog.runtime.error("Uncaught JS exception: \(message)")
            self?.fatalHandler?(.uncaughtException(message: message))
        }

        self.context = context
        self.bridge = bridge
        self.registry = registry
        JSRuntimeLog.runtime.info("JS runtime loaded")
    }

    // MARK: - Pipe

    /// Deliver one inbound message string to the SDK (BRIDGE.md `receive`).
    /// Marshalled onto the JS queue; safe to call from any thread.
    func receive(_ message: String) {
        queue.async { [weak self] in
            guard let self, !self.disposed else { return }
            guard let bridge = self.bridge else {
                JSRuntimeLog.runtime.error("receive() before load(); message dropped")
                return
            }
            bridge.invokeMethod("receive", withArguments: [message])
        }
    }

    /// Tear down the bridge, cancel every timer, and release the context.
    /// Idempotent; safe to call from any thread.
    func dispose() {
        queue.async { [weak self] in
            guard let self, !self.disposed else { return }
            self.disposed = true
            self.bridge?.invokeMethod("dispose", withArguments: [])
            self.registry?.cancelAll()
            self.bridge = nil
            self.context = nil
            self.registry = nil
            JSRuntimeLog.runtime.info("JS runtime disposed")
        }
    }
}
