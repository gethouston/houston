import Foundation

/// The native **fetch** half of the bridge port host (BRIDGE.md §9.1).
///
/// The embedded engine has no HTTP stack: every engine request leaves the SDK
/// as `fetch/start` and this port performs the real I/O with `URLSession`,
/// **streaming** the response back frame-by-frame:
///
///   `fetch/response { id, status, ok }` on headers →
///   `fetch/chunk { id, bytesBase64 }` per delegate data callback →
///   `fetch/done { id }` on clean completion, or `fetch/error { id, message }`.
///
/// Streaming is essential: the long-lived `GET …/events` SSE must emit chunks
/// as they arrive, never buffered to completion. We therefore use the
/// `URLSessionDataDelegate` callback path (`didReceive data:`) rather than
/// `Data`-buffering convenience APIs — each callback becomes one `fetch/chunk`,
/// which coalesces sanely without us re-chunking.
///
/// `fetch/abort { id }` cancels the task; teardown cancels all in-flight tasks.
final class FetchPort: NSObject, URLSessionDataDelegate {
    private let send: (String) -> Void
    private let onError: ((String) -> Void)?
    private let config: URLSessionConfiguration

    /// Guards the id ↔ task maps against concurrent delegate callbacks.
    private let lock = NSLock()
    /// fetch id → live task (source of truth for aborts / teardown).
    private var tasks: [String: URLSessionDataTask] = [:]
    /// task identifier → fetch id (delegate callbacks carry only the task).
    private var idByTask: [Int: String] = [:]

    private lazy var session: URLSession = URLSession(
        configuration: config,
        delegate: self,
        delegateQueue: nil
    )

    init(
        send: @escaping (String) -> Void,
        onError: ((String) -> Void)? = nil,
        configuration: URLSessionConfiguration = FetchPort.streamingConfiguration()
    ) {
        self.send = send
        self.onError = onError
        self.config = configuration
        super.init()
    }

    /// A session tuned for long-lived streams. `timeoutIntervalForRequest`
    /// bounds the gap *between* bytes; SSE can idle far past the 60s default,
    /// so we raise it to a day. `timeoutIntervalForResource` caps total
    /// lifetime at a week (resource sanity). Non-streaming requests override
    /// their per-request timeout to 60s in `start(_:)`.
    static func streamingConfiguration() -> URLSessionConfiguration {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 24 * 60 * 60
        c.timeoutIntervalForResource = 7 * 24 * 60 * 60
        c.waitsForConnectivity = true
        c.httpShouldUsePipelining = false
        return c
    }

    /// Route a `fetch/*` request frame. Returns whether it was handled here.
    func handle(_ data: Data, kind: String) -> Bool {
        switch kind {
        case "fetch/start": start(data); return true
        case "fetch/abort": abort(data); return true
        default: return false
        }
    }

    /// Cancel every in-flight request and tear the session down (SDK teardown).
    func teardown() {
        lock.lock()
        let all = Array(tasks.values)
        tasks.removeAll()
        idByTask.removeAll()
        lock.unlock()
        for task in all { task.cancel() }
        session.invalidateAndCancel()
    }

    // MARK: - Requests

    private func start(_ data: Data) {
        guard let frame = PortCodec.decode(FetchStartFrame.self, from: data) else { return }
        guard let url = URL(string: frame.url) else {
            emit(FetchErrorReply(id: frame.id, message: "invalid url: \(frame.url)"))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = frame.method ?? "GET"
        let headers = frame.headers ?? [:]
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if let body = frame.body { request.httpBody = Data(body.utf8) }
        if !isStreaming(headers) { request.timeoutInterval = 60 }

        let task = session.dataTask(with: request)
        lock.lock()
        tasks[frame.id] = task
        idByTask[task.taskIdentifier] = frame.id
        lock.unlock()
        task.resume()
    }

    private func abort(_ data: Data) {
        guard let frame = PortCodec.decode(FetchAbortFrame.self, from: data) else { return }
        lock.lock()
        let task = tasks.removeValue(forKey: frame.id)
        if let task { idByTask.removeValue(forKey: task.taskIdentifier) }
        lock.unlock()
        task?.cancel()
    }

    /// An SSE request opts out of the short per-request timeout.
    private func isStreaming(_ headers: [String: String]) -> Bool {
        let accept = headers["accept"] ?? headers["Accept"] ?? ""
        return accept.contains("text/event-stream")
    }

    // MARK: - URLSessionDataDelegate (streaming)

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let id = fetchId(for: dataTask) else {
            completionHandler(.cancel)
            return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        emit(FetchResponseReply(id: id, status: status, ok: (200..<300).contains(status)))
        completionHandler(.allow)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive data: Data
    ) {
        guard let id = fetchId(for: dataTask) else { return }
        emit(FetchChunkReply(id: id, bytesBase64: data.base64EncodedString()))
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        guard let id = removeFetchId(for: task) else { return }
        if let error = error as NSError? {
            // A cancel is an abort/teardown we initiated — the SDK already knows.
            if error.code == NSURLErrorCancelled { return }
            emit(FetchErrorReply(id: id, message: error.localizedDescription))
        } else {
            emit(FetchDoneReply(id: id))
        }
    }

    // MARK: - id lifecycle

    private func fetchId(for task: URLSessionTask) -> String? {
        lock.lock(); defer { lock.unlock() }
        return idByTask[task.taskIdentifier]
    }

    private func removeFetchId(for task: URLSessionTask) -> String? {
        lock.lock(); defer { lock.unlock() }
        guard let id = idByTask.removeValue(forKey: task.taskIdentifier) else { return nil }
        tasks.removeValue(forKey: id)
        return id
    }

    private func emit<T: Encodable>(_ reply: T) {
        guard let json = PortCodec.encode(reply) else {
            onError?("failed to encode fetch reply")
            return
        }
        send(json)
    }
}
