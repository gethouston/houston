import Foundation

/// The compact detail string a tool row shows after its verb — " — {detail}"
/// (PARITY §4/§5, `tool-formatters.tsx` `getToolDetail`). Pure so it is unit-
/// testable: the command for Bash, a short path for file tools, the pattern for
/// search tools, the host for a fetched URL.
enum ToolDetail {
    static func string(name: String, input: JSONValue?) -> String? {
        guard let input else { return nil }
        switch ToolLabel.shortName(name) {
        case "Bash":
            return input["command"]?.stringValue.map(truncate)
        case "Read", "Write", "Edit":
            return input["file_path"]?.stringValue.map(shortPath)
        case "Grep", "Glob":
            return input["pattern"]?.stringValue
        case "WebSearch":
            return input["query"]?.stringValue
        case "WebFetch":
            return input["url"]?.stringValue.map(shortURL)
        default:
            return nil
        }
    }

    private static func truncate(_ s: String) -> String {
        s.count > 80 ? String(s.prefix(77)) + "..." : s
    }

    /// Last two path segments (`.../dir/file.txt`), matching desktop `shortPath`.
    private static func shortPath(_ path: String) -> String {
        let parts = path.split(separator: "/")
        return parts.count > 2 ? parts.suffix(2).joined(separator: "/") : path
    }

    private static func shortURL(_ url: String) -> String {
        if let host = URL(string: url)?.host { return host }
        return url.count > 60 ? String(url.prefix(57)) + "..." : url
    }
}
