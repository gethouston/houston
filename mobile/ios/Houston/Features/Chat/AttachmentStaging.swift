import Foundation

/// One file staged in the composer before send (WhatsApp-style): the display
/// name plus its raw bytes, held until the send uploads them. `id` keeps the
/// staged-chip list stable across add/remove.
struct StagedAttachment: Identifiable, Equatable, Sendable {
  let id: UUID
  let name: String
  let data: Data

  init(id: UUID = UUID(), name: String, data: Data) {
    self.id = id
    self.name = name
    self.data = data
  }

  var byteCount: Int { data.count }
}

/// The pure add/remove/cap reducer over the composer's staged attachments, split
/// from the view + model so the size cap and rejection reporting are unit-tested
/// without a bridge or UI. Two caps guard against the host's 100 MB/request limit
/// AND the phone's memory: a deliberately conservative 20 MB PER FILE, and an
/// 80 MB AGGREGATE across the whole staged batch (base64-encoding every staged
/// file at send time is a full in-memory copy, so an uncapped batch could OOM the
/// app before the host ever returns its 413). A file that would breach either cap
/// is rejected up front with its name surfaced, never silently dropped.
enum AttachmentStaging {
  /// Per-file client cap in bytes (20 MB). Mirrors the "mobile stays well under
  /// the 100 MB host cap" contract.
  static let maxFileBytes = 20 * 1024 * 1024
  /// Aggregate cap across the whole staged batch (80 MB) — under the host's
  /// 100 MB/request limit AND a memory ceiling so base64-encoding the batch on
  /// send can't OOM the app.
  static let maxTotalBytes = 80 * 1024 * 1024

  /// Why a file could not be staged, so the alert can explain it precisely
  /// (an over-cap single file reads differently from a full batch).
  enum RejectReason: Equatable, Sendable {
    /// The file alone exceeds ``maxFileBytes``.
    case fileTooLarge
    /// The file fits, but adding it would push the batch past ``maxTotalBytes``.
    case batchFull
  }

  /// A file that could not be staged, carried to the alert so the user learns
  /// exactly which files were dropped and why.
  struct Rejection: Equatable, Sendable {
    let name: String
    let byteCount: Int
    let reason: RejectReason
  }

  /// The result of staging one file: the (possibly unchanged) list plus any
  /// rejection.
  struct AddOutcome: Equatable, Sendable {
    let staged: [StagedAttachment]
    let rejected: [Rejection]
  }

  /// Append `data` under `name` unless it breaches a cap — an oversize single
  /// file (``fileTooLarge``) or one that would push the batch past
  /// ``maxTotalBytes`` (``batchFull``). On a breach the list is unchanged and the
  /// file is reported as rejected. `id` is injectable so tests get deterministic
  /// identities.
  static func adding(
    _ current: [StagedAttachment], name: String, data: Data, id: UUID = UUID()
  ) -> AddOutcome {
    guard data.count <= maxFileBytes else {
      return reject(current, name: name, byteCount: data.count, reason: .fileTooLarge)
    }
    let currentTotal = current.reduce(0) { $0 + $1.byteCount }
    guard currentTotal + data.count <= maxTotalBytes else {
      return reject(current, name: name, byteCount: data.count, reason: .batchFull)
    }
    return AddOutcome(
      staged: current + [StagedAttachment(id: id, name: name, data: data)], rejected: [])
  }

  private static func reject(
    _ current: [StagedAttachment], name: String, byteCount: Int, reason: RejectReason
  ) -> AddOutcome {
    AddOutcome(
      staged: current, rejected: [Rejection(name: name, byteCount: byteCount, reason: reason)])
  }

  /// Drop the staged file with `id` (the chip's remove button). A no-op when
  /// nothing matches.
  static func removing(_ current: [StagedAttachment], id: UUID) -> [StagedAttachment] {
    current.filter { $0.id != id }
  }
}
