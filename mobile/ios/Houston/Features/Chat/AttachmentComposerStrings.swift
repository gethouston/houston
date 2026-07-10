import Foundation

// Composer-accessory copy for the "+" menu's grown-up surface: real file/photo
// attachment, the effort control, and the staged-attachment chips. Kept in a
// Chat-owned extension file (like `Strings+Chat.swift`) so surface agents never
// collide on the shared string file. No PARITY pin exists for these mobile-only
// affordances (desktop has a visible composer toolbar, not a "+" menu), so the
// copy is product-neutral and self-describing.
extension Strings.Chat {
  /// The "+" menu's four native actions.
  enum Compose {
    static let attachFile = "Attach file"
    static let attachPhoto = "Attach photo"
    static let chooseModel = "Choose model"
    static let effort = "Effort"
    /// Dismisses a settings sheet reached from an interaction card.
    static let done = "Done"
  }

  /// The staged-attachment chips (above the composer) and the per-file size cap
  /// alert.
  enum Attachments {
    /// VoiceOver label for the staged chips row / the in-bubble chips row.
    static let label = "Attachments"
    static func remove(_ name: String) -> String { "Remove \(name)" }
    static let tooLargeTitle = "File too large"
    /// `names` is a comma-joined list of the files that exceeded the 20 MB cap.
    static func tooLargeBody(_ names: String) -> String {
      "These files are over 20 MB and were not attached: \(names)"
    }
    /// The staged batch is already near the 80 MB total cap, so these files
    /// (each individually fine) did not fit. `names` is a comma-joined list.
    static func batchFullBody(_ names: String) -> String {
      "Your attachments are near the 80 MB limit, so these were not added: \(names)"
    }
    /// A file could not be read off disk. `detail` names what failed (a
    /// comma-joined file-name list).
    static func readFailed(_ detail: String) -> String {
      "Could not read \(detail). Try attaching it again."
    }
    /// Photos could not be read (the picker exposes a count, not names).
    /// Pluralized so a multi-photo failure reads grammatically.
    static func readFailedPhotos(_ count: Int) -> String {
      count == 1
        ? "Could not read 1 photo. Try attaching it again."
        : "Could not read \(count) photos. Try attaching them again."
    }
  }

  /// The effort sheet (mobile adaptation of the desktop composer's effort gauge).
  enum Effort {
    static let title = "Effort"
    static let cancel = "Cancel"
    /// The "no pin" row — new turns use the agent's default reasoning depth.
    static let defaultRow = "Default"
    static let emptyTitle = "No effort control"
    static let emptyDescription = "This model runs at a fixed reasoning depth."

    /// The human label for each reasoning level.
    static func level(_ level: EffortLevel) -> String {
      switch level {
      case .low: return "Low"
      case .medium: return "Medium"
      case .high: return "High"
      case .xhigh: return "Very high"
      case .max: return "Max"
      }
    }
  }
}
