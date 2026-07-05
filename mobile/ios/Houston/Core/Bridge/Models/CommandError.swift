import Foundation

/// A command that failed. Thrown by ``SdkClient/command(_:_:)`` when the SDK
/// replies `ok: false`, or when the reply does not arrive inside the timeout.
///
/// `status` is the upstream HTTP status when the failure was an engine/gateway
/// response (`401` rejected token, `404` unknown conversation — BRIDGE.md §5.1);
/// `nil` for a client-side failure such as a timeout.
struct CommandError: Error, Equatable {
  let status: Int?
  let message: String
  /// True when the failure was a local timeout, not an SDK-reported error.
  var isTimeout: Bool = false

  static func timeout(type: String, after duration: Duration) -> CommandError {
    CommandError(
      status: nil,
      message: "command \(type) timed out after \(duration)",
      isTimeout: true)
  }
}

extension CommandError: LocalizedError {
  var errorDescription: String? { message }
}
