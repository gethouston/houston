import Foundation

// AI Models surface copy (PARITY-SETTINGS §2/§6). The EXACT en copy is mirrored
// from the desktop locale files — `providers.json` (card/providerLogin/apiKey/
// signOutConfirm/toast/copilot) and `ai-hub.json` (hero/providerModal). A few
// strings have no desktop equivalent (the mobile per-agent scoping footer, the
// agent-picker step) because the desktop surface is not per-agent-scoped and has
// no tab chrome — those are marked and kept product-consistent (PARITY is law
// for everything that maps; new copy is flagged).
extension Strings {
  enum AIModels {
    /// Hero / nav title (ai-hub.json:hero.title).
    static let title = String(localized: "aiModels.title", defaultValue: "AI Models")

    /// Mobile-only: the per-agent credential scoping line (landmine 1 — provider
    /// credentials are per-agent-pod in hosted mode; surface it clearly). No
    /// desktop equivalent (desktop is not per-agent-scoped).
    static func scopedTo(_ agent: String) -> String {
      String(localized: "aiModels.scopedTo", defaultValue: "Connections are saved for \(agent) only. Each agent connects its own AI models.")
    }

    /// The scoping line before the agent's name has resolved.
    static let scopedGeneric =
      String(localized: "aiModels.scopedGeneric", defaultValue: "Connections are saved for this agent only. Each agent connects its own AI models.")

    /// Global-entry agent picker (mobile-only step; reuses the NewMission
    /// picker pattern, per-agent because credentials are per-agent).
    enum Picker {
      static let title = String(localized: "aiModels.picker.title", defaultValue: "Pick an agent")
      static let description = String(localized: "aiModels.picker.description", defaultValue: "AI models connect per agent. Choose which one to set up.")
    }

    /// Card states (providers.json:card).
    enum Card {
      static let connected = String(localized: "aiModels.card.connected", defaultValue: "Connected")
      static let notConnected = String(localized: "aiModels.card.notConnected", defaultValue: "Not connected")
      static let connecting = String(localized: "aiModels.card.connecting", defaultValue: "Connecting...")
      static let comingSoon = String(localized: "aiModels.card.comingSoon", defaultValue: "Coming soon")
      static let connect = String(localized: "aiModels.card.connect", defaultValue: "Connect")
    }

    /// Per-provider marketing description, keyed by the card's `descriptionKey`
    /// (ai-hub.json:providers.*.description). Returns nil for an uncatalogued
    /// provider so the card shows just its name (never a missing-key string).
    static func providerDescription(_ key: String?) -> String? {
      switch key {
      case "openai":
        return String(localized: "aiModels.providerDescription.openai", defaultValue: "Sign in with ChatGPT and put the GPT and Codex models to work.")
      case "anthropic":
        return String(localized: "aiModels.providerDescription.anthropic", defaultValue: "Sign in with Claude and bring the models behind Claude Code.")
      case "github-copilot":
        return String(localized: "aiModels.providerDescription.github-copilot", defaultValue: "One Copilot subscription, many models: Claude, GPT, and Gemini under one plan.")
      case "opencode-account":
        return String(localized: "aiModels.providerDescription.opencode-account", defaultValue: "One account for curated coding models from every major lab, with a free tier to start.")
      case "openrouter":
        return String(localized: "aiModels.providerDescription.openrouter", defaultValue: "The everything gateway. One key unlocks hundreds of models from every lab.")
      case "deepseek":
        return String(localized: "aiModels.providerDescription.deepseek", defaultValue: "Frontier reasoning at a fraction of the price, straight from DeepSeek.")
      case "google":
        return String(localized: "aiModels.providerDescription.google", defaultValue: "The Gemini family from Google AI Studio, with a free tier to start.")
      case "amazon-bedrock":
        return String(localized: "aiModels.providerDescription.amazon-bedrock", defaultValue: "Claude and more on your own AWS account, built for companies.")
      case "minimax":
        return String(localized: "aiModels.providerDescription.minimax", defaultValue: "Fast, affordable models tuned for agent work.")
      default: return nil
      }
    }

    /// OAuth login sheet copy (providers.json:providerLogin).
    enum Login {
      static func title(_ name: String) -> String { String(localized: "aiModels.login.title", defaultValue: "Finish signing in to \(name)") }
      static let deviceDescription =
        String(localized: "aiModels.login.deviceDescription", defaultValue: "Open the link below, sign in, then enter this one-time code to finish.")
      static let deviceCodeLabel = String(localized: "aiModels.login.deviceCodeLabel", defaultValue: "One-time code")
      static func deviceCodeHint(_ name: String) -> String {
        String(localized: "aiModels.login.deviceCodeHint", defaultValue: "Enter this code on the \(name) page after you sign in.")
      }
      static let deviceWaiting = String(localized: "aiModels.login.deviceWaiting", defaultValue: "Waiting for you to authorize in your browser...")
      static let copyCode = String(localized: "aiModels.login.copyCode", defaultValue: "Copy code")
      static let codeCopied = String(localized: "aiModels.login.codeCopied", defaultValue: "Code copied!")
      static let openUrl = String(localized: "aiModels.login.openUrl", defaultValue: "Open URL")
      // OpenAI/Codex device-code hint (providers.json:providerLogin.deviceSettingsHint,
      // link markup stripped — the whole line opens ChatGPT settings).
      static let deviceSettingsHint =
        String(localized: "aiModels.login.deviceSettingsHint", defaultValue: "Not seeing a code prompt? Turn on device-code sign-in in ChatGPT Settings > Security.")
      // auth_code flow (providers.json:providerLogin.authCodeDescription/code*).
      static func authCodeDescription(_ name: String) -> String {
        String(localized: "aiModels.login.authCodeDescription", defaultValue: "Paste a setup token to finish connecting \(name).")
      }
      static let codeLabel = String(localized: "aiModels.login.codeLabel", defaultValue: "Verification code")
      static let codePlaceholder = String(localized: "aiModels.login.codePlaceholder", defaultValue: "Paste the code from your browser")
      static let codeRequired = String(localized: "aiModels.login.codeRequired", defaultValue: "Enter the verification code first.")
      static let submit = String(localized: "aiModels.login.submit", defaultValue: "Submit code")
      static let cancel = String(localized: "aiModels.login.cancel", defaultValue: "Cancel")
    }

    /// API-key sheet copy (providers.json:apiKey).
    enum ApiKey {
      static func title(_ name: String) -> String { String(localized: "aiModels.apiKey.title", defaultValue: "Connect \(name)") }
      static func description(_ name: String) -> String {
        String(localized: "aiModels.apiKey.description", defaultValue: "Paste your \(name) API key. Houston keeps it safe and uses it for your chats.")
      }
      static let getKey = String(localized: "aiModels.apiKey.getKey", defaultValue: "Get your API key")
      static let label = String(localized: "aiModels.apiKey.label", defaultValue: "API key")
      static let placeholder = String(localized: "aiModels.apiKey.placeholder", defaultValue: "Paste your API key")
      static let required = String(localized: "aiModels.apiKey.required", defaultValue: "Enter your API key first.")
      static let save = String(localized: "aiModels.apiKey.save", defaultValue: "Connect")
      static let cancel = String(localized: "aiModels.apiKey.cancel", defaultValue: "Cancel")
    }

    /// GitHub Copilot Personal-vs-Enterprise prompt (providers.json:copilot).
    enum Copilot {
      static let title = String(localized: "aiModels.copilot.title", defaultValue: "Connect GitHub Copilot")
      static let description = String(localized: "aiModels.copilot.description", defaultValue: "Choose how you use Copilot.")
      static let personalTitle = String(localized: "aiModels.copilot.personalTitle", defaultValue: "Personal")
      static let personalDesc = String(localized: "aiModels.copilot.personalDesc", defaultValue: "Your own Copilot on github.com.")
      static let companyTitle = String(localized: "aiModels.copilot.companyTitle", defaultValue: "Company (GitHub Enterprise)")
      static let companyDesc = String(localized: "aiModels.copilot.companyDesc", defaultValue: "Copilot your company provides.")
      static let domainLabel = String(localized: "aiModels.copilot.domainLabel", defaultValue: "Company GitHub domain")
      static let domainPlaceholder = String(localized: "aiModels.copilot.domainPlaceholder", defaultValue: "company.ghe.com")
      static let domainHint = String(localized: "aiModels.copilot.domainHint", defaultValue: "Ask your IT team if you're not sure.")
      static let cancel = String(localized: "aiModels.copilot.cancel", defaultValue: "Cancel")
      static let cont = String(localized: "aiModels.copilot.cont", defaultValue: "Continue")
    }

    /// Sign-out confirmation (providers.json:signOutConfirm).
    enum SignOut {
      static func title(_ provider: String) -> String { String(localized: "aiModels.signOut.title", defaultValue: "Sign out of \(provider)?") }
      static func description(_ provider: String) -> String {
        String(localized: "aiModels.signOut.description", defaultValue: "Houston will stop using \(provider) until you sign in again. Existing missions can still finish their current turn.")
      }
      static let confirm = String(localized: "aiModels.signOut.confirm", defaultValue: "Sign out")
      static let cancel = String(localized: "aiModels.signOut.cancel", defaultValue: "Cancel")
    }

    /// Connected-provider detail + model picker (ai-hub.json:providerModal / model).
    enum Detail {
      static func signedInWith(_ provider: String) -> String { String(localized: "aiModels.detail.signedInWith", defaultValue: "Signed in with \(provider)") }
      static let signOut = String(localized: "aiModels.detail.signOut", defaultValue: "Sign out")
      static let models = String(localized: "aiModels.detail.models", defaultValue: "Models")
      static let noModels = String(localized: "aiModels.detail.noModels", defaultValue: "Models are ready as soon as you connect.")
      static let effort = String(localized: "aiModels.detail.effort", defaultValue: "Reasoning effort")
    }

    /// Reasoning-effort level labels (chat.json:effortLevels).
    static func effortLabel(_ level: EffortLevel) -> String {
      switch level {
      case .low: return String(localized: "aiModels.effortLabel.low", defaultValue: "Low")
      case .medium: return String(localized: "aiModels.effortLabel.medium", defaultValue: "Medium")
      case .high: return String(localized: "aiModels.effortLabel.high", defaultValue: "High")
      case .xhigh: return String(localized: "aiModels.effortLabel.xhigh", defaultValue: "Extra high")
      case .max: return String(localized: "aiModels.effortLabel.max", defaultValue: "Max")
      }
    }

    /// Ephemeral status messages (providers.json:toast). Surfaced inline (there
    /// is no global toast host on iOS yet), so they read as short banners.
    enum Toast {
      static func signInFailed(_ provider: String) -> String { String(localized: "aiModels.toast.signInFailed", defaultValue: "Couldn't open \(provider) sign-in") }
      static func signOutFailed(_ provider: String) -> String { String(localized: "aiModels.toast.signOutFailed", defaultValue: "Couldn't sign out of \(provider)") }
      static func signInSucceeded(_ provider: String) -> String { String(localized: "aiModels.toast.signInSucceeded", defaultValue: "Signed in to \(provider)") }
      static func cancelFailed(_ provider: String) -> String { String(localized: "aiModels.toast.cancelFailed", defaultValue: "Couldn't cancel \(provider) sign-in") }
    }
  }
}
