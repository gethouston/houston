import Foundation
import Security

/// A string key/value store the storage port persists into. Two concrete
/// backings exist — the Keychain (token custody) and `UserDefaults`
/// (everything else) — behind this seam so the routing in `StoragePort` is
/// unit-testable with in-memory fakes.
///
/// Reads return `nil` for a genuine miss and **throw** only on a real backend
/// failure, so the port can distinguish "absent" (reply `null`) from "broken"
/// (surface the error) rather than swallowing it.
protocol KeyValueBacking {
    func read(_ key: String) throws -> String?
    func write(_ key: String, _ value: String) throws
    func remove(_ key: String) throws
}

/// A Keychain `OSStatus` that was not success or a benign not-found.
struct KeychainError: Error {
    let status: OSStatus
}

/// Keychain-backed store (`kSecClassGenericPassword`). Items use the app's
/// default access group (no `kSecAttrAccessGroup` set) and are readable after
/// first unlock on this device only — background SSE needs the token while the
/// device is locked, but the item never leaves the device or syncs to iCloud.
final class KeychainBacking: KeyValueBacking {
    private let service: String

    init(service: String = "ai.gethouston.houston.sdk") {
        self.service = service
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    func read(_ key: String) throws -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        guard let data = out as? Data, let value = String(data: data, encoding: .utf8) else {
            throw KeychainError(status: errSecInvalidData)
        }
        return value
    }

    func write(_ key: String, _ value: String) throws {
        let data = Data(value.utf8)
        var add = baseQuery(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update = [kSecValueData as String: data]
            let updated = SecItemUpdate(baseQuery(key) as CFDictionary, update as CFDictionary)
            guard updated == errSecSuccess else { throw KeychainError(status: updated) }
        } else {
            guard status == errSecSuccess else { throw KeychainError(status: status) }
        }
    }

    func remove(_ key: String) throws {
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        // Deleting an absent item is a no-op success (idempotent).
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError(status: status)
        }
    }
}

/// `UserDefaults`-backed store for all non-token keys. `UserDefaults` never
/// fails these operations, so the methods do not throw in practice.
final class DefaultsBacking: KeyValueBacking {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func read(_ key: String) throws -> String? {
        defaults.string(forKey: key)
    }

    func write(_ key: String, _ value: String) throws {
        defaults.set(value, forKey: key)
    }

    func remove(_ key: String) throws {
        defaults.removeObject(forKey: key)
    }
}
