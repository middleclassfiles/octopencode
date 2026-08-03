import type { GitHubRepoSummarySnapshot } from "../githubRepoSummary";
import type { MonitorService } from "../monitor";
import type { UsageChartResponse } from "../opencodeSessionScanner";
import type { OpencodeUsageSnapshot } from "../opencodeUsage";
import type { GitClient } from "../terminalRuntime";

export type CreateApiServerOptions = {
  workspaceCwd?: string | undefined;
  projectStateDir?: string | undefined;
  promptsDir?: string | undefined;
  webDistDir?: string | undefined;
  apiBaseUrl?: string | undefined;
  gitClient?: GitClient;
  readOpencodeUsageSnapshot?: () => Promise<OpencodeUsageSnapshot>;
  readGithubRepoSummary?: () => Promise<GitHubRepoSummarySnapshot>;
  scanUsageHeatmap?: (scope: "all" | "project") => Promise<UsageChartResponse>;
  monitorService?: MonitorService;
  invalidateOpencodeUsageCache?: () => void;
  allowRemoteAccess?: boolean;
};
