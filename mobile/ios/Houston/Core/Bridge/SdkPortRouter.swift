import Foundation

/// Demultiplexes the bridge's outbound stream into the native ports.
///
/// The JS bridge emits every host-bound message through a single `send`
/// callback: SDK protocol frames (`ready`, `result`, `snapshot`, `event`,
/// `fatal`, `log`, …) **and** native-port requests (`fetch/*`, `storage/*`).
/// `handle(_:)` claims the port requests and services them; anything else it
/// leaves for the SDK client by returning `false`.
///
/// Replies are written back through the same `send` closure the caller wires
/// to `JSRuntime.receive`. Per BRIDGE.md §8 the host must not re-enter the JS
/// engine synchronously from within its own `send`; fetch replies already
/// originate from `URLSession` delegate callbacks (a fresh native stack), and
/// the caller's `send` is expected to hop onto the JS thread. This router adds
/// no synchronous re-entrancy of its own.
final class SdkPortRouter {
    private let fetchPort: FetchPort
    private let storagePort: StoragePort

    init(
        send: @escaping (String) -> Void,
        secure: KeyValueBacking = KeychainBacking(),
        plain: KeyValueBacking = DefaultsBacking(),
        tokenKey: String = SessionKeys.tokenKey,
        onError: ((String) -> Void)? = nil,
        fetchConfiguration: URLSessionConfiguration = FetchPort.streamingConfiguration()
    ) {
        fetchPort = FetchPort(send: send, onError: onError, configuration: fetchConfiguration)
        storagePort = StoragePort(
            send: send,
            secure: secure,
            plain: plain,
            tokenKey: tokenKey,
            onError: onError
        )
    }

    /// Dispatch one outbound bridge message. Returns `true` when it was a port
    /// request this router consumed, `false` when the SDK client should handle
    /// it (or it was not JSON / had no `kind`).
    @discardableResult
    func handle(_ message: String) -> Bool {
        guard let data = message.data(using: .utf8),
              let kind = PortCodec.decode(BridgeKindPeek.self, from: data)?.kind
        else { return false }

        if kind.hasPrefix("fetch/") { return fetchPort.handle(data, kind: kind) }
        if kind.hasPrefix("storage/") { return storagePort.handle(data, kind: kind) }
        return false
    }

    /// Cancel all in-flight fetches and release the URL session (SDK teardown).
    func teardown() {
        fetchPort.teardown()
    }
}
