import Foundation

/// The native **storage** half of the bridge port host (BRIDGE.md §9.2).
///
/// The SDK persists its session token through this port. Routing is by key:
/// the session-token key (`SessionKeys.tokenKey`) goes to the Keychain;
/// everything else to `UserDefaults`. Every request is answered with exactly
/// one `storage/result` — carrying `value` (string | null) for a `get`, and
/// omitting it for `set`/`delete`.
final class StoragePort {
    private let secure: KeyValueBacking
    private let plain: KeyValueBacking
    private let tokenKey: String
    private let send: (String) -> Void
    private let onError: ((String) -> Void)?

    init(
        send: @escaping (String) -> Void,
        secure: KeyValueBacking = KeychainBacking(),
        plain: KeyValueBacking = DefaultsBacking(),
        tokenKey: String = SessionKeys.tokenKey,
        onError: ((String) -> Void)? = nil
    ) {
        self.send = send
        self.secure = secure
        self.plain = plain
        self.tokenKey = tokenKey
        self.onError = onError
    }

    /// Route a `storage/*` request frame. Returns whether it was handled here.
    func handle(_ data: Data, kind: String) -> Bool {
        switch kind {
        case "storage/get", "storage/set", "storage/delete":
            guard let frame = PortCodec.decode(StorageFrame.self, from: data) else { return true }
            dispatch(kind: kind, frame: frame)
            return true
        default:
            return false
        }
    }

    private func backing(for key: String) -> KeyValueBacking {
        key == tokenKey ? secure : plain
    }

    private func dispatch(kind: String, frame: StorageFrame) {
        let store = backing(for: frame.key)
        switch kind {
        case "storage/get":
            let value = readValue(store, frame.key)
            reply(StorageResultReply(id: frame.id, includeValue: true, value: value))
        case "storage/set":
            write(store, frame.key, frame.value ?? "")
            reply(StorageResultReply(id: frame.id, includeValue: false, value: nil))
        case "storage/delete":
            delete(store, frame.key)
            reply(StorageResultReply(id: frame.id, includeValue: false, value: nil))
        default:
            break
        }
    }

    private func readValue(_ store: KeyValueBacking, _ key: String) -> String? {
        do {
            return try store.read(key)
        } catch {
            // A backend failure is not a miss: surface it, then reply `null`
            // since the wire has no storage error channel.
            onError?("storage get failed for \(key): \(error)")
            return nil
        }
    }

    private func write(_ store: KeyValueBacking, _ key: String, _ value: String) {
        do {
            try store.write(key, value)
        } catch {
            onError?("storage set failed for \(key): \(error)")
        }
    }

    private func delete(_ store: KeyValueBacking, _ key: String) {
        do {
            try store.remove(key)
        } catch {
            onError?("storage delete failed for \(key): \(error)")
        }
    }

    private func reply(_ result: StorageResultReply) {
        guard let json = PortCodec.encode(result) else {
            onError?("failed to encode storage reply")
            return
        }
        send(json)
    }
}
