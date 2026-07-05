import Foundation
import os

/// Shared logging facade for the JavaScriptCore host.
///
/// Everything the runtime emits — JS `console.*` lines, uncaught JS exceptions,
/// and host-side lifecycle notes — funnels through one `os.Logger` subsystem
/// (`houston-js`) so it can be filtered as a unit in Console.app / `log stream`.
/// Categories separate the JS-authored lines (`console`) from host-authored
/// lifecycle/exception lines (`runtime`).
enum JSRuntimeLog {
    /// The single os_log subsystem for all JavaScriptCore host output.
    static let subsystem = "houston-js"

    /// Lines authored by JS via the `console` polyfill.
    static let console = Logger(subsystem: subsystem, category: "console")

    /// Lines authored by the Swift host: load/dispose, uncaught exceptions.
    static let runtime = Logger(subsystem: subsystem, category: "runtime")
}
