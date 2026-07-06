import Foundation

/// The app's marketing version, for the Settings version footer
/// (`settings:version` = "Version {{version}}"; tap copies it).
enum AppVersion {
    /// `CFBundleShortVersionString` (the `MARKETING_VERSION`, e.g. "0.1.0"),
    /// falling back to "0.0.0" if the Info.plist somehow lacks it.
    static var marketing: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0.0"
    }

    /// The full "Version x.y.z" line shown in the footer.
    static var footer: String { Strings.Settings.version(marketing) }
}
