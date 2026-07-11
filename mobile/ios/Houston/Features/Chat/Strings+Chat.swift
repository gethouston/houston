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
    // Composer. A fresh mission invites the first message (ai-board.tsx:700-703);
    // an ongoing conversation reads like a messenger. Mobile uses "Message" (not
    // desktop's "Send a follow-up...") on purpose — WhatsApp / Telegram familiarity.
    static let newMissionPlaceholder = String(localized: "chat.newMissionPlaceholder", defaultValue: "What should the agent work on?")
    static let followUpPlaceholder = String(localized: "chat.followUpPlaceholder", defaultValue: "Message")
    static let send = String(localized: "chat.send", defaultValue: "Send")
    static let stop = String(localized: "chat.stop", defaultValue: "Stop")
    static let addAttachment = String(localized: "chat.addAttachment", defaultValue: "Add attachment")
    static let scrollToLatest = String(localized: "chat.scrollToLatest", defaultValue: "Scroll to latest")

    // The model picker sheet (mobile adaptation of `use-chat-model-picker.tsx` —
    // NOT the 600px popover with favorites/recents/connect; a plain per-agent
    // list of each configured provider's models).
    enum ModelPicker {
      static let title = String(localized: "chat.modelPicker.title", defaultValue: "Model")
      static let cancel = String(localized: "chat.modelPicker.cancel", defaultValue: "Cancel")
      static let emptyTitle = String(localized: "chat.modelPicker.emptyTitle", defaultValue: "No models yet")
      static let emptyDescription = String(localized: "chat.modelPicker.emptyDescription", defaultValue: "Connect a provider from the desktop app to choose a model.")
    }

    // Live status line (chat.json:process).
    static let missionInProgress = String(localized: "chat.missionInProgress", defaultValue: "Mission in progress...")
    static func missionInProgress(action: String) -> String {
      String(localized: "chat.missionInProgressAction", defaultValue: "Mission in progress: \(action)")
    }
    /// The settled process-block header label (chat.json:process.complete).
    /// This is ONLY the collapsed header — never a block that repeats the reply.
    static let missionLog = String(localized: "chat.missionLog", defaultValue: "Mission log")
    /// Accessibility label for the pending queued-message bubbles (PARITY §7).
    static let queued = String(localized: "chat.queued", defaultValue: "Queued messages")

    // Reasoning block (chat.json:reasoning).
    static let thinking = String(localized: "chat.thinking", defaultValue: "Thinking...")
    static func thoughtFor(seconds: Int) -> String { String(localized: "chat.thoughtFor", defaultValue: "Thought for \(seconds) seconds") }
    static let thoughtForFew = String(localized: "chat.thoughtForFew", defaultValue: "Thought for a few seconds")

    // File-change summary (chat.json:summary + top-level filesUpdated_*).
    static let updatesMade = String(localized: "chat.updatesMade", defaultValue: "Updates made")
    static func newFiles(_ count: Int) -> String {
      String(localized: "chat.newFiles", defaultValue: "\(count) new files")
    }
    static func filesUpdated(_ count: Int) -> String {
      String(localized: "chat.filesUpdated", defaultValue: "\(count) files updated")
    }

    // Subtle dividers (chat.json:contextCompacted / providerSwitch.divider*).
    static let contextCompacted = String(localized: "chat.contextCompacted", defaultValue: "Earlier conversation summarized so the chat can keep going")
    static func continuedWith(provider: String) -> String { String(localized: "chat.continuedWith", defaultValue: "Continued with \(provider)") }
    static func continuedWithSummarized(provider: String) -> String {
      String(localized: "chat.continuedWithSummarized", defaultValue: "Continued with \(provider), summarized to fit")
    }

    // Tool runtime error (feed-to-messages.ts + chat.json:toolRuntimeError).
    static let toolRuntimeError = String(localized: "chat.toolRuntimeError", defaultValue: "A local tool failed to start.")
    static let tryAgain = String(localized: "chat.tryAgain", defaultValue: "Try again.")

    // Empty chat (chat.json:empty).
    static let emptyTitle = String(localized: "chat.emptyTitle", defaultValue: "Start a conversation")
    static let emptyDescription = String(localized: "chat.emptyDescription", defaultValue: "Type a message to talk to your assistant.")

    // Action-failure alert. Not pinned by PARITY (desktop uses a toast); kept
    // neutral and product-consistent, surfacing the real reason (no silent
    // failures). Update if PARITY later pins mobile error copy.
    static let errorTitle = String(localized: "chat.errorTitle", defaultValue: "Something went wrong")
    static let dismiss = String(localized: "chat.dismiss", defaultValue: "OK")

    // Typed provider-error cards (shell.json:providerError.*). Each maps a
    // ProviderError kind to a title + detail (PARITY §5).
    enum ProviderErrorCopy {
      static let rateLimitedTitle = String(localized: "chat.providerErrorCopy.rateLimitedTitle", defaultValue: "Hit a rate limit")
      static func rateLimitedBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.rateLimitedBody", defaultValue: "The \(provider) API is throttling requests. Wait a moment and try again.")
      }
      static func rateLimitedBody(provider: String, seconds: Int) -> String {
        String(localized: "chat.providerErrorCopy.rateLimitedBodyWithSeconds", defaultValue: "The \(provider) API is throttling requests. Try again in \(seconds)s.")
      }

      static let quotaTitle = String(localized: "chat.providerErrorCopy.quotaTitle", defaultValue: "Out of capacity")
      static func quotaBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.quotaBody", defaultValue: "Your \(provider) plan reached its quota. Upgrade or switch to a different provider to keep going.")
      }
      static func quotaBody(provider: String, resetsAt: String) -> String {
        String(localized: "chat.providerErrorCopy.quotaBodyWithReset", defaultValue: "Your \(provider) plan reached its quota. It resets \(resetsAt), or upgrade to keep going.")
      }

      static let usagePausedTitle = String(localized: "chat.providerErrorCopy.usagePausedTitle", defaultValue: "You've reached your plan's limit")
      static let usagePausedBody = String(localized: "chat.providerErrorCopy.usagePausedBody", defaultValue: "You've used up your plan for now. Wait for it to reset, then keep going.")
      static func usagePausedBody(resetsAt: String) -> String {
        String(localized: "chat.providerErrorCopy.usagePausedBodyWithReset", defaultValue: "You've used up your plan for now. It resets at \(resetsAt), then you can keep going.")
      }

      static let modelUnavailableTitle = String(localized: "chat.providerErrorCopy.modelUnavailableTitle", defaultValue: "Model not available")
      static func modelUnavailableBody(model: String, provider: String) -> String {
        String(localized: "chat.providerErrorCopy.modelUnavailableBody", defaultValue: "\(model) is not available on your \(provider) account.")
      }

      static func unauthenticatedTitle(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unauthenticatedTitle", defaultValue: "Sign in to \(provider) again")
      }
      static func unauthTokenExpired(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unauthTokenExpired", defaultValue: "Your \(provider) session expired. Reconnect to continue.")
      }
      static func unauthNoCredentials(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unauthNoCredentials", defaultValue: "Houston needs you to sign in to \(provider) before it can answer.")
      }
      static func unauthInvalidApiKey(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unauthInvalidApiKey", defaultValue: "The \(provider) API key Houston has is no longer valid. Update it and try again.")
      }
      static func unauthTokenRevoked(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unauthTokenRevoked", defaultValue: "Your \(provider) access was revoked. Sign in again to continue.")
      }
      static func unauthUnknown(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unauthUnknown", defaultValue: "Houston could not authenticate with \(provider). Reconnect and try again.")
      }

      static func networkTitle(provider: String) -> String { String(localized: "chat.providerErrorCopy.networkTitle", defaultValue: "Cannot reach \(provider)") }
      static func networkBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.networkBody", defaultValue: "Houston could not reach the \(provider) API. Check your internet, then try again.")
      }

      static func providerInternalTitle(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.providerInternalTitle", defaultValue: "\(provider) is having a problem")
      }
      static func providerInternalBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.providerInternalBody", defaultValue: "The \(provider) API returned an error on its side. Try again in a moment.")
      }

      static let sessionRestartedTitle = String(localized: "chat.providerErrorCopy.sessionRestartedTitle", defaultValue: "Session restarted")
      static func sessionRestartedBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.sessionRestartedBody", defaultValue: "The previous \(provider) conversation could not be reopened, so Houston restarted it. Your message was sent again and the assistant is responding below.")
      }

      static let malformedTitle = String(localized: "chat.providerErrorCopy.malformedTitle", defaultValue: "Got a broken response")
      static func malformedBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.malformedBody", defaultValue: "The \(provider) response was not readable. Try again, this is usually temporary.")
      }

      static func spawnFailedTitle(provider: String) -> String { String(localized: "chat.providerErrorCopy.spawnFailedTitle", defaultValue: "Could not start \(provider)") }
      static func spawnFailedBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.spawnFailedBody", defaultValue: "Houston could not start \(provider). Try reinstalling, then report it if it keeps happening.")
      }

      static let unknownTitle = String(localized: "chat.providerErrorCopy.unknownTitle", defaultValue: "Something unexpected happened")
      static func unknownBody(provider: String) -> String {
        String(localized: "chat.providerErrorCopy.unknownBody", defaultValue: "Houston could not classify this \(provider) error. Report it so we can teach Houston to handle it next time.")
      }
      static let rawLabel = String(localized: "chat.providerErrorCopy.rawLabel", defaultValue: "Raw output")
    }
  }
}
