import Foundation

/// The three UI locales Houston ships (`SUPPORTED_LOCALES`, `app/src/lib/locale.ts`).
/// The display names are proper nouns and are NOT translated — they mirror the
/// desktop `LOCALE_LABELS` map (`settings/sections/language.tsx`) verbatim.
enum AppLocale: String, CaseIterable, Identifiable, Sendable {
    case en
    case es
    case pt

    var id: String { rawValue }

    /// The endonym shown in the picker (same as desktop, unlocalized).
    var displayName: String {
        switch self {
        case .en: return "English"
        case .es: return "Español"
        case .pt: return "Português"
        }
    }

    /// Normalize a BCP-47 tag (`pt-BR`, `es_419`) to a supported locale, or `nil`
    /// when unset/unknown. Mirrors `normalizeLocale` in `app/src/lib/locale.ts`:
    /// lowercase, take the base subtag before `-`/`_`, keep only en/es/pt.
    static func normalize(_ raw: String?) -> AppLocale? {
        guard let raw, !raw.isEmpty else { return nil }
        let base = raw.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first
        guard let base else { return nil }
        return AppLocale(rawValue: String(base))
    }

    /// The selection the picker shows for an engine-resolved value: the resolved
    /// locale, or English when nothing valid is set (desktop's `currentLocale`
    /// fallback in `LanguageSection`).
    static func selection(for raw: String?) -> AppLocale {
        normalize(raw) ?? .en
    }
}
