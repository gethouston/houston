import Foundation
import JavaScriptCore

/// Installs `console.{log,info,warn,error,debug}`, routing every line to the
/// `houston-js` os_log subsystem (category `console`).
///
/// The SDK's own diagnostics travel over the `log` port, not `console`
/// (BRIDGE.md §9.3), so this is a convenience for anything the bundled JS or its
/// dependencies happen to `console.*`. Argument joining is done in a tiny JS glue
/// (where `String(value)`/`JSON.stringify` are natural); the native sink only
/// maps the level to an os_log type.
///
/// - Note: Interpolated messages use os_log's default (private) redaction — a
///   `console` line may carry user content, so it is not forced `.public`.
enum JSConsolePolyfill {
    /// Define `console` on the context's global object. Install before evaluating
    /// the bundle so the bundle's `typeof console` check leaves ours in place.
    static func install(into context: JSContext) {
        let sink: @convention(block) (String, String) -> Void = { level, message in
            emit(level: level, message: message)
        }
        context.setObject(sink, forKeyedSubscript: "__houstonConsoleSink" as NSString)
        context.evaluateScript(consoleGlue)
    }

    private static func emit(level: String, message: String) {
        switch level {
        case "debug": JSRuntimeLog.console.debug("\(message)")
        case "warn": JSRuntimeLog.console.warning("\(message)")
        case "error": JSRuntimeLog.console.error("\(message)")
        default: JSRuntimeLog.console.info("\(message)")
        }
    }

    /// Builds `console` in JS: each method stringifies its args and calls the sink.
    private static let consoleGlue = """
    (function () {
      var sink = __houstonConsoleSink;
      function fmt(args) {
        var out = [];
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (typeof a === 'string') { out.push(a); }
          else {
            try { out.push(JSON.stringify(a)); }
            catch (e) { out.push(String(a)); }
          }
        }
        return out.join(' ');
      }
      function make(level) { return function () { sink(level, fmt(arguments)); }; }
      globalThis.console = {
        log: make('log'), info: make('info'), warn: make('warn'),
        error: make('error'), debug: make('debug')
      };
    })();
    """
}
