import Foundation

/// A failure originating in the JavaScriptCore host or the JS it runs.
///
/// These are never swallowed: setup failures `throw` out of ``JSRuntime/load``,
/// and asynchronous JS exceptions are delivered to `JSRuntime.onFatal` (a lapsed
/// runtime is unusable and the surface must be told). This is distinct from the
/// SDK's own protocol/command/`fatal` surfaces, which travel *inside* bridge
/// messages over the pipe — this type is only for the engine host itself failing.
enum JSRuntimeError: Error, Equatable, CustomStringConvertible {
    /// The bundled `houston-sdk.bridge.js` resource was not found in the app bundle.
    case bundleResourceMissing(name: String)
    /// The bundle source could not be read from disk.
    case bundleUnreadable(underlying: String)
    /// Evaluating the bundle script raised a JS exception (syntax/eval error).
    case evaluationFailed(message: String)
    /// The evaluated bundle did not expose the expected `HoustonSdkBridge` global.
    case bridgeGlobalMissing
    /// `HoustonSdkBridge.create({ send })` did not return a usable bridge handle.
    case bridgeCreateFailed(message: String)
    /// An uncaught JS exception surfaced through the context exception handler.
    case uncaughtException(message: String)

    var description: String {
        switch self {
        case let .bundleResourceMissing(name):
            return "JS bundle resource missing: \(name)"
        case let .bundleUnreadable(underlying):
            return "JS bundle unreadable: \(underlying)"
        case let .evaluationFailed(message):
            return "JS bundle evaluation failed: \(message)"
        case .bridgeGlobalMissing:
            return "HoustonSdkBridge global not found after evaluating bundle"
        case let .bridgeCreateFailed(message):
            return "HoustonSdkBridge.create failed: \(message)"
        case let .uncaughtException(message):
            return "Uncaught JS exception: \(message)"
        }
    }
}
