import Foundation

/// Client for Houston's gateway email-OTP endpoints — the iOS mirror of the
/// desktop's `identity/otp.ts`. GCIP has no built-in 6-digit email OTP, so the
/// gateway owns it: it emails the code, verifies it, and returns a GCIP
/// CUSTOM TOKEN the client exchanges via `GcipAuth.signInWithCustomToken`.
///
/// ── CONTRACT (pinned in `identity/otp.ts`; served by the Go gateway) ──
///   POST {gateway}/v1/auth/email-otp/start   { email }         → 204 No Content
///   POST {gateway}/v1/auth/email-otp/verify  { email, code }   → 200 { customToken }
///     · 401 → wrong / expired code   (IdentityError .otpInvalidCode)
///     · 429 → rate limited           (IdentityError .otpRateLimited)
struct EmailOtpClient {
    let gatewayBaseURL: String
    let session: URLSession

    init(gatewayBaseURL: String, session: URLSession = .shared) {
        self.gatewayBaseURL = gatewayBaseURL
        self.session = session
    }

    /// Request a 6-digit code be emailed to `email`. Returns on 204.
    func start(email: String) async throws {
        _ = try await post(path: "/v1/auth/email-otp/start", json: ["email": email])
    }

    /// Verify the code; return the gateway-minted GCIP custom token.
    func verify(email: String, code: String) async throws -> String {
        let data = try await post(
            path: "/v1/auth/email-otp/verify",
            json: ["email": email, "code": code]
        )
        guard
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
            let customToken = obj["customToken"] as? String, !customToken.isEmpty
        else {
            throw IdentityError(.malformedResponse)
        }
        return customToken
    }

    private static func otpError(status: Int) -> IdentityError {
        switch status {
        case 401: IdentityError(.otpInvalidCode, httpStatus: status)
        case 429: IdentityError(.otpRateLimited, httpStatus: status)
        default: IdentityError(.unknown, httpStatus: status)
        }
    }

    private func post(path: String, json: [String: String]) async throws -> Data {
        let base = gatewayBaseURL.hasSuffix("/") ? String(gatewayBaseURL.dropLast()) : gatewayBaseURL
        guard let url = URL(string: "\(base)\(path)") else {
            throw IdentityError(.malformedResponse, rawCode: "gateway_url")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(json)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw IdentityError(.network)
        }
        guard let http = response as? HTTPURLResponse else {
            throw IdentityError(.network)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw Self.otpError(status: http.statusCode)
        }
        return data
    }
}
