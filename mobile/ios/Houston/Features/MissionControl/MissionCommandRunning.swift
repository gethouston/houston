import Foundation

/// The narrow command seam Mission Control + New Mission write through.
///
/// It is exactly the one `SdkClient` method these surfaces need — dispatch a
/// typed command and decode its `result.value`. Naming it as a protocol lets the
/// action/create/search flows take a stub in unit tests instead of standing up
/// the whole bridge. `SdkClient` already has the matching signature, so its
/// conformance is free (below).
@MainActor
protocol MissionCommandRunning: AnyObject {
  func command<P: Encodable, T: Decodable>(_ type: String, _ payload: P) async throws -> T
}

extension SdkClient: MissionCommandRunning {}
