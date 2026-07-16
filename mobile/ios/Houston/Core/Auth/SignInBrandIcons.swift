import SwiftUI

/// Official sign-in provider marks (Google, Microsoft) for the sign-in
/// buttons — geometry copied byte-for-byte from the desktop
/// `provider-brand-icons.tsx`. Brand colours are mandated by the providers'
/// guidelines: the one sanctioned exception to the no-hex rule, and the
/// buttons' only accent. (Apple's mark comes with `SignInWithAppleButton`.)
struct GoogleMark: View {
    var size: CGFloat = 16

    private static let viewBox = CGSize(width: 48, height: 48)
    /// (path, mandated brand colour) — red, blue, yellow, green.
    private static let paths: [(d: String, color: Color)] = [
        ("M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z",
         Color(red: 0xEA / 255, green: 0x43 / 255, blue: 0x35 / 255)),
        ("M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z",
         Color(red: 0x42 / 255, green: 0x85 / 255, blue: 0xF4 / 255)),
        ("M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z",
         Color(red: 0xFB / 255, green: 0xBC / 255, blue: 0x05 / 255)),
        ("M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z",
         Color(red: 0x34 / 255, green: 0xA8 / 255, blue: 0x53 / 255)),
    ]

    var body: some View {
        ZStack {
            ForEach(Array(Self.paths.enumerated()), id: \.offset) { _, path in
                ProviderLogoShape(viewBox: Self.viewBox, paths: [path.d])
                    .fill(path.color)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The official Microsoft four-square mark (21×21 viewBox, 9×9 squares).
struct MicrosoftMark: View {
    var size: CGFloat = 16

    private static let squares: [(rect: CGRect, color: Color)] = [
        (CGRect(x: 1, y: 1, width: 9, height: 9), Color(red: 0xF2 / 255, green: 0x50 / 255, blue: 0x22 / 255)),
        (CGRect(x: 11, y: 1, width: 9, height: 9), Color(red: 0x7F / 255, green: 0xBA / 255, blue: 0x00 / 255)),
        (CGRect(x: 1, y: 11, width: 9, height: 9), Color(red: 0x00 / 255, green: 0xA4 / 255, blue: 0xEF / 255)),
        (CGRect(x: 11, y: 11, width: 9, height: 9), Color(red: 0xFF / 255, green: 0xB9 / 255, blue: 0x00 / 255)),
    ]

    var body: some View {
        ZStack {
            ForEach(Array(Self.squares.enumerated()), id: \.offset) { _, square in
                ProviderLogoShape(
                    viewBox: CGSize(width: 21, height: 21),
                    roundedRects: [.init(rect: square.rect, radius: 0)]
                )
                .fill(square.color)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
