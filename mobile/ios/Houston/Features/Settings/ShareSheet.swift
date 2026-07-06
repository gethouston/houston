import SwiftUI
import UIKit

/// A thin SwiftUI wrapper over `UIActivityViewController` — the system share
/// sheet. Used by Report bug to hand the composed report (message + log tail) to
/// mail / the user's app of choice.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
