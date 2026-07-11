import Foundation

// Interaction-card copy. Mirrors the EXACT en strings desktop uses so the two
// surfaces stay in lockstep (PARITY is law): `questionCard.*`, `interaction.*`,
// `composio.connect`, and `planReady.*` from `app/src/locales/en/chat.json`.
//
// The free-text hint has no desktop twin: desktop REPLACES its composer with the
// card, mobile keeps the composer live below it, so the hint is a mobile-native
// line (like the composer's `Compose` menu items). It is the only invented
// string here.
extension Strings {
  enum Interaction {
    // Question step. Progress caption (questionCard.progress: "{{current}} of
    // {{total}}"); the numbers come from ``InteractionStepper/progress``.
    static func progress(_ current: Int, _ total: Int) -> String { String(localized: "interaction.progress", defaultValue: "\(current) of \(total)") }
    // Mobile-only: the composer below the card IS the free-text answer path.
    static let freeTextHint = String(localized: "interaction.freeTextHint", defaultValue: "Or type your own answer below.")

    // Sign-in step (interaction.*). Shown when a tool needs the user signed in
    // to Houston; the button routes to AI Models where the same Google SSO lives.
    static let signinReason = String(localized: "interaction.signinReason", defaultValue: "Sign in to Houston to continue.")
    static let signinTitle = String(localized: "interaction.signinTitle", defaultValue: "Sign in to Houston")
    static let signinDescription = String(localized: "interaction.signinDescription", defaultValue: "Your accounts stay yours; the agent acts on your behalf.")
    static let signin = String(localized: "interaction.signin", defaultValue: "Sign in")

    // Connect step. The button routes to Integrations; the toolkit name the step
    // carries is the title (composio.connect for the button label).
    static let connect = String(localized: "interaction.connect", defaultValue: "Connect")

    // Advance a multi-step signin/connect sequence to the next step
    // (questionCard.forward: "Next").
    static let continueStep = String(localized: "interaction.continueStep", defaultValue: "Next")

    // Plan-ready step (planReady.*). The single approve row mirrors desktop's
    // PRIMARY "Continue in Coworker mode" action, which sends `startWorkingMessage`
    // as a normal (execute) turn. The other two desktop options (Autopilot, Keep
    // planning) have no mobile seam and are deferred.
    static let planTitle = String(localized: "interaction.planTitle", defaultValue: "Plan ready")
    static let planApproveTitle = String(localized: "interaction.planApproveTitle", defaultValue: "Continue in Coworker mode")
    static let planApproveDescription = String(localized: "interaction.planApproveDescription", defaultValue: "Works with you and asks when unsure.")
    static let planApproveMessage = String(localized: "interaction.planApproveMessage", defaultValue: "Go ahead with the plan.")
  }
}
