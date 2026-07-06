import SwiftUI

/// Which mark a provider id resolves to. The mapping is a pure function so the
/// dispatch table can be unit-tested without rendering; `ProviderGlyph` is a thin
/// renderer over it. Mirrors `ProviderGlyph` in
/// `app/src/components/shell/provider-logos.tsx:243-274` exactly — including the
/// two-id-namespace pairs (openai/openai-codex, google/gemini, opencode/opencode-go)
/// and the first-initial fallback that stops a new provider from silently
/// borrowing the wrong brand's logo.
enum ProviderLogoKind: Equatable {
    case claude
    case openai
    case gemini
    case githubCopilot
    case openRouter
    case amazonBedrock
    case opencode
    case localModel
    case deepseek
    case minimax
    /// Unknown provider → its first initial, uppercased ("" when id is empty).
    case initial(String)

    static func forProvider(_ providerId: String) -> ProviderLogoKind {
        switch providerId {
        case "anthropic": return .claude
        case "openai", "openai-codex": return .openai
        case "google", "gemini": return .gemini
        case "github-copilot": return .githubCopilot
        case "openrouter": return .openRouter
        case "amazon-bedrock": return .amazonBedrock
        case "opencode", "opencode-go": return .opencode
        case "openai-compatible": return .localModel
        case "deepseek": return .deepseek
        case "minimax": return .minimax
        default:
            return .initial(providerId.isEmpty ? "" : String(providerId.prefix(1)).uppercased())
        }
    }
}

/// The monochrome provider mark for a provider id — the single entry point cards
/// use for the "which AI provider" glyph (reconnect, sign-in, rate-limit,
/// provider-switch). Defaults to a 20×20 render.
struct ProviderGlyph: View {
    let providerId: String
    var size: CGFloat = 20

    var body: some View {
        switch ProviderLogoKind.forProvider(providerId) {
        case .claude: ClaudeLogo(size: size)
        case .openai: OpenAILogo(size: size)
        case .gemini: GeminiLogo(size: size)
        case .githubCopilot: GitHubCopilotLogo(size: size)
        case .openRouter: OpenRouterLogo(size: size)
        case .amazonBedrock: AmazonBedrockLogo(size: size)
        case .opencode: OpenCodeLogo(size: size)
        case .localModel: LocalModelLogo(size: size)
        case .deepseek: DeepSeekLogo(size: size)
        case .minimax: MiniMaxLogo(size: size)
        case .initial: ProviderInitialFallback(providerId: providerId, size: size)
        }
    }
}
