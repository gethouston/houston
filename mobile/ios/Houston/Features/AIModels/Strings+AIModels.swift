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
    static let title = "AI Models"

    /// Mobile-only: the per-agent credential scoping line (landmine 1 — provider
    /// credentials are per-agent-pod in hosted mode; surface it clearly). No
    /// desktop equivalent (desktop is not per-agent-scoped).
    static func scopedTo(_ agent: String) -> String {
      "Connections are saved for \(agent) only. Each agent connects its own AI models."
    }

    /// The scoping line before the agent's name has resolved.
    static let scopedGeneric =
      "Connections are saved for this agent only. Each agent connects its own AI models."

    /// Global-entry agent picker (mobile-only step; reuses the NewMission
    /// picker pattern, per-agent because credentials are per-agent).
    enum Picker {
      static let title = "Pick an agent"
      static let description = "AI models connect per agent. Choose which one to set up."
    }

    /// Card states (providers.json:card).
    enum Card {
      static let connected = "Connected"
      static let notConnected = "Not connected"
      static let connecting = "Connecting..."
      static let comingSoon = "Coming soon"
      static let connect = "Connect"
    }

    /// Per-provider marketing description, keyed by the card's `descriptionKey`
    /// (ai-hub.json:providers.*.description). Returns nil for an uncatalogued
    /// provider so the card shows just its name (never a missing-key string).
    static func providerDescription(_ key: String?) -> String? {
      switch key {
      case "openai": return "Sign in with ChatGPT and put the GPT and Codex models to work."
      case "anthropic": return "Sign in with Claude and bring the models behind Claude Code."
      case "github-copilot":
        return "One Copilot subscription, many models: Claude, GPT, and Gemini under one plan."
      case "opencode-account":
        return "One account for curated coding models from every major lab, with a free tier to start."
      case "openrouter":
        return "The everything gateway. One key unlocks hundreds of models from every lab."
      case "deepseek": return "Frontier reasoning at a fraction of the price, straight from DeepSeek."
      case "google": return "The Gemini family from Google AI Studio, with a free tier to start."
      case "amazon-bedrock": return "Claude and more on your own AWS account, built for companies."
      case "minimax": return "Fast, affordable models tuned for agent work."
      default: return nil
      }
    }

    /// OAuth login sheet copy (providers.json:providerLogin).
    enum Login {
      static func title(_ name: String) -> String { "Finish signing in to \(name)" }
      static let deviceDescription =
        "Open the link below, sign in, then enter this one-time code to finish."
      static let deviceCodeLabel = "One-time code"
      static func deviceCodeHint(_ name: String) -> String {
        "Enter this code on the \(name) page after you sign in."
      }
      static let deviceWaiting = "Waiting for you to authorize in your browser..."
      static let copyCode = "Copy code"
      static let codeCopied = "Code copied!"
      static let openUrl = "Open URL"
      // OpenAI/Codex device-code hint (providers.json:providerLogin.deviceSettingsHint,
      // link markup stripped — the whole line opens ChatGPT settings).
      static let deviceSettingsHint =
        "Not seeing a code prompt? Turn on device-code sign-in in ChatGPT Settings > Security."
      // auth_code flow (providers.json:providerLogin.authCodeDescription/code*).
      static func authCodeDescription(_ name: String) -> String {
        "Paste a setup token to finish connecting \(name)."
      }
      static let codeLabel = "Verification code"
      static let codePlaceholder = "Paste the code from your browser"
      static let codeRequired = "Enter the verification code first."
      static let submit = "Submit code"
      static let cancel = "Cancel"
    }

    /// API-key sheet copy (providers.json:apiKey).
    enum ApiKey {
      static func title(_ name: String) -> String { "Connect \(name)" }
      static func description(_ name: String) -> String {
        "Paste your \(name) API key. Houston keeps it safe and uses it for your chats."
      }
      static let getKey = "Get your API key"
      static let label = "API key"
      static let placeholder = "Paste your API key"
      static let required = "Enter your API key first."
      static let save = "Connect"
      static let cancel = "Cancel"
    }

    /// GitHub Copilot Personal-vs-Enterprise prompt (providers.json:copilot).
    enum Copilot {
      static let title = "Connect GitHub Copilot"
      static let description = "Choose how you use Copilot."
      static let personalTitle = "Personal"
      static let personalDesc = "Your own Copilot on github.com."
      static let companyTitle = "Company (GitHub Enterprise)"
      static let companyDesc = "Copilot your company provides."
      static let domainLabel = "Company GitHub domain"
      static let domainPlaceholder = "company.ghe.com"
      static let domainHint = "Ask your IT team if you're not sure."
      static let cancel = "Cancel"
      static let cont = "Continue"
    }

    /// Sign-out confirmation (providers.json:signOutConfirm).
    enum SignOut {
      static func title(_ provider: String) -> String { "Sign out of \(provider)?" }
      static func description(_ provider: String) -> String {
        "Houston will stop using \(provider) until you sign in again. "
          + "Existing missions can still finish their current turn."
      }
      static let confirm = "Sign out"
      static let cancel = "Cancel"
    }

    /// Connected-provider detail + model picker (ai-hub.json:providerModal / model).
    enum Detail {
      static func signedInWith(_ provider: String) -> String { "Signed in with \(provider)" }
      static let signOut = "Sign out"
      static let models = "Models"
      static let noModels = "Models are ready as soon as you connect."
      static let effort = "Reasoning effort"
    }

    /// Reasoning-effort level labels (chat.json:effortLevels).
    static func effortLabel(_ level: EffortLevel) -> String {
      switch level {
      case .low: return "Low"
      case .medium: return "Medium"
      case .high: return "High"
      case .xhigh: return "Extra high"
      case .max: return "Max"
      }
    }

    /// Ephemeral status messages (providers.json:toast). Surfaced inline (there
    /// is no global toast host on iOS yet), so they read as short banners.
    enum Toast {
      static func signInFailed(_ provider: String) -> String { "Couldn't open \(provider) sign-in" }
      static func signOutFailed(_ provider: String) -> String { "Couldn't sign out of \(provider)" }
      static func signInSucceeded(_ provider: String) -> String { "Signed in to \(provider)" }
      static func cancelFailed(_ provider: String) -> String { "Couldn't cancel \(provider) sign-in" }
    }
  }
}
