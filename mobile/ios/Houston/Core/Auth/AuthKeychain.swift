import Foundation
import os
import Security

private let keychainLog = Logger(subsystem: "ai.gethouston.app", category: "auth")

/// Failures from the Keychain-backed session store. Never swallowed silently —
/// callers surface these to the user (per the no-silent-failures policy).
/// A blob that exists but does not DECODE is not an error: it is a legacy
/// (Supabase-era) or corrupt session, discarded with a log — the desktop
/// `session-store.ts` lesson.
enum AuthKeychainError: Error, Equatable {
    case unexpectedStatus(OSStatus)
}

/// Stores the Houston `AuthSession` as one JSON generic-password item in the
/// iOS Keychain. Access token, refresh token, and expiry live together so a
/// read is atomic. Accessible after first unlock, this device only (never
/// synced to iCloud / other devices).
struct AuthKeychain {
    let service: String
    let account: String

    static let shared = AuthKeychain(
        service: "ai.gethouston.app.auth",
        account: "houston-session"
    )

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func load() throws -> AuthSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else {
            throw AuthKeychainError.unexpectedStatus(status)
        }
        guard let data = item as? Data,
              let session = try? JSONDecoder().decode(AuthSession.self, from: data)
        else {
            // A stale pre-Firebase blob (the key is reused) or corrupt JSON:
            // discard it as signed-out, visibly — never a throw, never accepted.
            keychainLog.warning(
                "discarding session blob of unknown shape (legacy or corrupt), treating as signed out")
            try? clear()
            return nil
        }
        return session
    }

    func save(_ session: AuthSession) throws {
        let data = try JSONEncoder().encode(session)
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        // Upsert: update in place, else add.
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attrs as CFDictionary)
        if updateStatus == errSecSuccess { return }
        if updateStatus == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery.merge(attrs) { _, new in new }
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw AuthKeychainError.unexpectedStatus(addStatus)
            }
            return
        }
        throw AuthKeychainError.unexpectedStatus(updateStatus)
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthKeychainError.unexpectedStatus(status)
        }
    }
}
