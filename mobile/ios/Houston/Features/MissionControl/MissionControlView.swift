import SwiftUI

/// The Mission Control tab (PARITY §1-3). Aggregates missions across every agent
/// from the shared `agentsOverview` seam and shows one of three bodies: the
/// swipeable status pager, the Archived list, or search results — with the agent
/// filter and search field in a sticky header, and the Archived toggle in the
/// toolbar. Card actions (Approve / Rename / Archive) run through `MissionActions`.
struct MissionControlView: View {
  @Environment(\.theme) private var theme
  @Environment(\.agentsOverview) private var overview
  @Environment(\.chatViewBuilder) private var chatViewBuilder

  @State private var navPath: [ChatRoute] = []
  @State private var selectedAgentId: String?
  @State private var showingArchived = false
  @State private var selectedColumn: BoardColumn = .running
  @State private var didLandInitialColumn = false
  @State private var search = MissionSearchModel()
  @State private var presentingNewMission = false

  // Action UI state.
  @State private var renameTarget: MissionCardData?
  @State private var renameText = ""
  @State private var archiveTarget: MissionCardData?
  @State private var actionError: String?
  @State private var retention: ScopeRetention?

  private let actions = MissionActions()

  var body: some View {
    NavigationStack(path: $navPath) {
      VStack(spacing: Spacing.space12) {
        header
        body(for: overview.agents)
      }
      .background(theme.background)
      .navigationTitle(showingArchived ? Strings.Board.archived : Strings.Board.missionControlTitle)
      .navigationBarTitleDisplayMode(.large)
      .toolbar { archivedToolbarItem }
      .navigationDestination(for: ChatRoute.self) { chatViewBuilder($0) }
    }
    .sheet(isPresented: $presentingNewMission) { NewMissionSheet() }
    .missionActionDialogs(
      renameTarget: $renameTarget, renameText: $renameText,
      archiveTarget: $archiveTarget, actionError: $actionError,
      onCommitRename: commitRename, onCommitArchive: commitArchive
    )
    .onAppear {
      if retention == nil { retention = overview.retain() }
      landInitialColumn(overview.agents)
    }
    .onDisappear { retention?.cancel(); retention = nil }
    .onChange(of: selectedAgentId) { _, id in
      search.agentFilter = id
      if search.isSearching { search.queryChanged() }
    }
    .onChange(of: overview.agents) { _, agents in landInitialColumn(agents) }
  }

  // MARK: Header (search + agent filter)

  private var header: some View {
    VStack(spacing: Spacing.space12) {
      SearchField(
        text: $search.query,
        placeholder: showingArchived ? Strings.Search.archivedPlaceholder : Strings.Search.placeholder
      )
      .padding(.horizontal, Spacing.space16)
      .onChange(of: search.query) { _, _ in search.queryChanged() }
      AgentFilterBar(agents: MissionAggregation.filterAgents(overview.agents), selection: $selectedAgentId)
    }
  }

  private var archivedToolbarItem: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Button {
        withAnimation(.easeInOut(duration: Motion.fast)) { showingArchived.toggle() }
      } label: {
        Label(Strings.Board.archived, systemImage: showingArchived ? "archivebox.fill" : "archivebox")
      }
      .tint(showingArchived ? theme.primary : theme.foreground)
      .accessibilityAddTraits(showingArchived ? [.isSelected] : [])
    }
  }

  // MARK: Body switching

  @ViewBuilder private func body(for agents: [AgentActivities]) -> some View {
    if search.isSearching {
      MissionSearchResultsView(state: search.state, query: search.query, onOpen: open)
    } else if showingArchived {
      ArchivedMissionsView(agents: agents, agentFilter: selectedAgentId, onOpen: open)
    } else if !overview.loaded {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if agents.isEmpty {
      EmptyStateView(
        title: Strings.Empty.noAgentsTitle, description: Strings.Empty.noAgentsDescription,
        systemImage: "person.2"
      )
    } else if MissionAggregation.activeBoardIsEmpty(agents: agents, agentFilter: selectedAgentId) {
      EmptyStateView(
        title: Strings.Empty.boardTitle, description: Strings.Empty.boardDescription,
        systemImage: "square.stack.3d.up", ctaTitle: Strings.Board.newMission,
        ctaAction: { presentingNewMission = true }
      )
    } else {
      MissionControlPager(
        agents: agents, agentFilter: selectedAgentId, selection: $selectedColumn,
        onOpen: open, onApprove: approve, onRename: startRename, onArchive: startArchive
      )
    }
  }

  // MARK: Actions

  private func open(_ route: ChatRoute) { navPath.append(route) }

  private func approve(_ card: MissionCardData) {
    run { try await actions.approve(card) }
  }

  private func startRename(_ card: MissionCardData) {
    renameTarget = card
    renameText = card.title
  }

  private func commitRename() {
    guard let card = renameTarget else { return }
    let title = renameText
    renameTarget = nil
    run { try await actions.rename(card, to: title) }
  }

  private func startArchive(_ card: MissionCardData) { archiveTarget = card }

  private func commitArchive() {
    guard let card = archiveTarget else { return }
    archiveTarget = nil
    run { try await actions.archive(card) }
  }

  /// The page to land on: Needs you when non-empty, else Running (PARITY §1).
  /// Applied once, the first time real data arrives.
  private func landInitialColumn(_ agents: [AgentActivities]) {
    guard !didLandInitialColumn, overview.loaded, !agents.isEmpty else { return }
    didLandInitialColumn = true
    selectedColumn = MissionAggregation.initialColumn(agents: agents, agentFilter: selectedAgentId)
  }

  private func run(_ operation: @escaping () async throws -> Void) {
    Task { @MainActor in
      do { try await operation() } catch { actionError = String(describing: error) }
    }
  }
}
