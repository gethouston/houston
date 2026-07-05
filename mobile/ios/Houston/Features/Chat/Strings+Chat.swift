import Foundation

// Mission-chat copy. Mirrors the EXACT en strings the desktop uses so the two
// surfaces stay in lockstep (PARITY §5 is law): reasoning/process from
// `app/src/locales/en/chat.json`, the file-change summary from `chat.json`, and
// the typed provider-error cards from `app/src/locales/en/shell.json`
// (`providerError.*`). No copy is invented here.
//
// This extension is Chat-owned (added alongside `DesignSystem/Strings.swift`) so
// surface agents never collide on the shared file.
extension Strings {
  enum Chat {
    // Composer (chat.json:composer).
    static let composerPlaceholder = "Ask anything..."
    static let send = "Send"
    static let stop = "Stop"
    static let scrollToLatest = "Scroll to latest"

    // Live status line (chat.json:process).
    static let missionInProgress = "Mission in progress..."
    static func missionInProgress(action: String) -> String {
      "Mission in progress: \(action)"
    }
    /// The settled turn-summary heading (chat.json:process.complete).
    static let missionLog = "Mission log"

    // Reasoning block (chat.json:reasoning).
    static let thinking = "Thinking..."
    static func thoughtFor(seconds: Int) -> String { "Thought for \(seconds) seconds" }
    static let thoughtForFew = "Thought for a few seconds"

    // File-change summary (chat.json:summary + top-level filesUpdated_*).
    static let updatesMade = "Updates made"
    static func newFiles(_ count: Int) -> String {
      count == 1 ? "1 new file" : "\(count) new files"
    }
    static func filesUpdated(_ count: Int) -> String {
      count == 1 ? "1 file updated" : "\(count) files updated"
    }

    // Subtle dividers (chat.json:contextCompacted / providerSwitch.divider*).
    static let contextCompacted = "Earlier conversation summarized so the chat can keep going"
    static func continuedWith(provider: String) -> String { "Continued with \(provider)" }
    static func continuedWithSummarized(provider: String) -> String {
      "Continued with \(provider), summarized to fit"
    }

    // Tool runtime error (feed-to-messages.ts + chat.json:toolRuntimeError).
    static let toolRuntimeError = "A local tool failed to start."
    static let tryAgain = "Try again."

    // Approve bar (board.json:cardActions.approve, PARITY §5).
    static let moveToDone = "Move to done"

    // Empty chat (chat.json:empty).
    static let emptyTitle = "Start a conversation"
    static let emptyDescription = "Type a message to talk to your assistant."

    // Action-failure alert. Not pinned by PARITY (desktop uses a toast); kept
    // neutral and product-consistent, surfacing the real reason (no silent
    // failures). Update if PARITY later pins mobile error copy.
    static let errorTitle = "Something went wrong"
    static let dismiss = "OK"

    // Typed provider-error cards (shell.json:providerError.*). Each maps a
    // ProviderError kind to a title + detail (PARITY §5).
    enum ProviderErrorCopy {
      static let rateLimitedTitle = "Hit a rate limit"
      static func rateLimitedBody(provider: String) -> String {
        "The \(provider) API is throttling requests. Wait a moment and try again."
      }
      static func rateLimitedBody(provider: String, seconds: Int) -> String {
        "The \(provider) API is throttling requests. Try again in \(seconds)s."
      }

      static let quotaTitle = "Out of capacity"
      static func quotaBody(provider: String) -> String {
        "Your \(provider) plan reached its quota. Upgrade or switch to a different provider to keep going."
      }
      static func quotaBody(provider: String, resetsAt: String) -> String {
        "Your \(provider) plan reached its quota. It resets \(resetsAt), or upgrade to keep going."
      }

      static let usagePausedTitle = "You've reached your plan's limit"
      static let usagePausedBody = "You've used up your plan for now. Wait for it to reset, then keep going."
      static func usagePausedBody(resetsAt: String) -> String {
        "You've used up your plan for now. It resets at \(resetsAt), then you can keep going."
      }

      static let modelUnavailableTitle = "Model not available"
      static func modelUnavailableBody(model: String, provider: String) -> String {
        "\(model) is not available on your \(provider) account."
      }

      static func unauthenticatedTitle(provider: String) -> String {
        "Sign in to \(provider) again"
      }
      static func unauthTokenExpired(provider: String) -> String {
        "Your \(provider) session expired. Reconnect to continue."
      }
      static func unauthNoCredentials(provider: String) -> String {
        "Houston needs you to sign in to \(provider) before it can answer."
      }
      static func unauthInvalidApiKey(provider: String) -> String {
        "The \(provider) API key Houston has is no longer valid. Update it and try again."
      }
      static func unauthTokenRevoked(provider: String) -> String {
        "Your \(provider) access was revoked. Sign in again to continue."
      }
      static func unauthUnknown(provider: String) -> String {
        "Houston could not authenticate with \(provider). Reconnect and try again."
      }

      static func networkTitle(provider: String) -> String { "Cannot reach \(provider)" }
      static func networkBody(provider: String) -> String {
        "Houston could not reach the \(provider) API. Check your internet, then try again."
      }

      static func providerInternalTitle(provider: String) -> String {
        "\(provider) is having a problem"
      }
      static func providerInternalBody(provider: String) -> String {
        "The \(provider) API returned an error on its side. Try again in a moment."
      }

      static let sessionRestartedTitle = "Session restarted"
      static func sessionRestartedBody(provider: String) -> String {
        "The previous \(provider) conversation could not be reopened, so Houston restarted it. Your message was sent again and the assistant is responding below."
      }

      static let malformedTitle = "Got a broken response"
      static func malformedBody(provider: String) -> String {
        "The \(provider) response was not readable. Try again, this is usually temporary."
      }

      static func spawnFailedTitle(provider: String) -> String { "Could not start \(provider)" }
      static func spawnFailedBody(provider: String) -> String {
        "Houston could not start \(provider). Try reinstalling, then report it if it keeps happening."
      }

      static let unknownTitle = "Something unexpected happened"
      static func unknownBody(provider: String) -> String {
        "Houston could not classify this \(provider) error. Report it so we can teach Houston to handle it next time."
      }
      static let rawLabel = "Raw output"
    }
  }
}
