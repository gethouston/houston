import Foundation
import Observation

/// Debounced mission search over the `missions/search` command (PARITY §3).
///
/// Typing updates `query`; `queryChanged()` restarts a short debounce and then
/// dispatches one search, cancelling any in-flight one so only the latest query
/// resolves. Runs over ALL statuses (active + archived), scoped to the current
/// agent filter or every agent when it is nil — exactly as the desktop does.
///
/// Note on the history-error state: the SDK degrades a per-mission history fetch
/// failure silently (logs through its port, still returns the matches it has),
/// so a *partial* failure is not observable to this caller. `state == .failed`
/// therefore covers a whole-command failure, reusing the closest exact copy
/// ("Couldn't search every mission"). Documented deviation from the desktop's
/// per-mission toast.
@MainActor
@Observable
final class MissionSearchModel {
  /// The live query text (bound to the search field).
  var query: String = ""
  /// The current rendered state.
  private(set) var state: MissionSearchState = .idle

  private let runner: any MissionCommandRunning
  private let debounce: Duration
  /// The agent to scope search to, or nil for every agent.
  var agentFilter: String?

  private var searchTask: Task<Void, Never>?

  init(
    runner: any MissionCommandRunning = SdkClient.shared,
    agentFilter: String? = nil,
    debounce: Duration = .milliseconds(300)
  ) {
    self.runner = runner
    self.agentFilter = agentFilter
    self.debounce = debounce
  }

  /// Whether a query is active (the search surface should replace the board).
  var isSearching: Bool {
    !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Call on every `query` change. Debounces, then runs a single search for the
  /// latest text. An empty query resets to `.idle` immediately.
  func queryChanged() {
    searchTask?.cancel()
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      state = .idle
      return
    }
    state = .searching
    let delay = debounce
    searchTask = Task { [weak self] in
      try? await Task.sleep(for: delay)
      if Task.isCancelled { return }
      await self?.run(trimmed)
    }
  }

  /// Clear the query and cancel any pending search.
  func clear() {
    searchTask?.cancel()
    query = ""
    state = .idle
  }

  private func run(_ trimmed: String) async {
    do {
      let matches: [MissionMatch] = try await runner.command(
        "missions/search",
        MissionSearchPayload(query: trimmed, agentId: agentFilter)
      )
      if Task.isCancelled { return }
      state = matches.isEmpty ? .empty : .results(matches)
    } catch {
      if Task.isCancelled { return }
      state = .failed
    }
  }
}
