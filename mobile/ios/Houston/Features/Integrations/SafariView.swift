import SafariServices
import SwiftUI

/// A thin SwiftUI wrapper over `SFSafariViewController` — the in-app browser the
/// integration connect flow opens the hosted OAuth `redirectUrl` in
/// (PARITY-SETTINGS §3). Presented as a full-screen cover; the user finishes the
/// app's sign-in there and returns, and the flow polls the connection.
struct SafariView: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    SFSafariViewController(url: url)
  }

  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
