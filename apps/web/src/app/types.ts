import type { GitHubCommitPoint, buildTerminalList } from "@hydra/core";

export type TerminalView = Awaited<ReturnType<typeof buildTerminalList>>;

export type {
  OpencodeUsageSnapshot,
  GitHubCommitPoint,
  GitHubRecentCommit,
  GitHubRepoSummarySnapshot,
  TerminalAgentProvider,
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  MonitorUsageSnapshot,
  MonitorPost,
  MonitorConfigSnapshot,
  MonitorFeedSnapshot,
  ConversationTurn,
  ConversationTranscriptEvent,
  ConversationSessionSummary,
  ConversationSessionDetail,
  ConversationSearchHit,
} from "@hydra/core";

export type { PersistedUiState as FrontendUiStateSnapshot } from "@hydra/core";
export type { TentacleWorkspaceMode as TerminalWorkspaceMode } from "@hydra/core";

export type GitHubCommitSparkPoint = GitHubCommitPoint & {
  x: number;
  y: number;
};

export type PromptLibraryEntry = {
  name: string;
  source: "builtin" | "user";
};

export type PromptDetail = {
  name: string;
  source: "builtin" | "user";
  content: string;
};
