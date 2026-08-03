import { execFileSync } from "node:child_process";

export type UsageSlice = {
  key: string;
  tokens: number;
};

export type UsageDayEntry = {
  date: string;
  totalTokens: number;
  projects: UsageSlice[];
  models: UsageSlice[];
  sessions: number;
};

export type UsageChartResponse = {
  days: UsageDayEntry[];
  projects: string[];
  models: string[];
};

type ChartRow = {
  day?: string | null;
  project?: string | null;
  model?: string | null;
  total_tokens?: number | string | null;
  session_count?: number | string | null;
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRows = (value: unknown): ChartRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is ChartRow =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
};

const runOpencodeDb = (sql: string): unknown => {
  const output = execFileSync("opencode", ["db", sql, "--format", "json"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30_000,
    windowsHide: true,
  });
  return JSON.parse(output) as unknown;
};

const sqlQuote = (value: string): string => value.replace(/'/g, "''");

const projectLabelFromDirectory = (directory: string): string => {
  const trimmed = directory.trim();
  if (trimmed.length === 0) {
    return "unknown";
  }
  const segments = trimmed.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments.length > 0 ? (segments[segments.length - 1] ?? "unknown") : trimmed;
};

const aggregateChart = (rows: ChartRow[], allProjects: Set<string>): UsageChartResponse => {
  const projectTotals = new Map<string, number>();
  const modelTotals = new Map<string, number>();
  const days = new Map<string, UsageDayEntry>();

  for (const row of rows) {
    const day = typeof row.day === "string" ? row.day : null;
    if (!day) {
      continue;
    }

    const totalTokens = toNumber(row.total_tokens);
    const projectKey = row.project ?? "unknown";
    const modelKey = row.model ?? "unknown";

    if (projectKey !== "unknown") {
      allProjects.add(projectKey);
    }
    projectTotals.set(projectKey, (projectTotals.get(projectKey) ?? 0) + totalTokens);
    modelTotals.set(modelKey, (modelTotals.get(modelKey) ?? 0) + totalTokens);

    let entry = days.get(day);
    if (!entry) {
      entry = { date: day, totalTokens: 0, projects: [], models: [], sessions: 0 };
      days.set(day, entry);
    }
    entry.totalTokens += totalTokens;
    entry.sessions += toNumber(row.session_count);
    entry.projects.push({ key: projectKey, tokens: totalTokens });
    entry.models.push({ key: modelKey, tokens: totalTokens });
  }

  const mergeSlices = (slices: UsageSlice[]): UsageSlice[] => {
    const merged = new Map<string, number>();
    for (const slice of slices) {
      merged.set(slice.key, (merged.get(slice.key) ?? 0) + slice.tokens);
    }
    return Array.from(merged.entries())
      .map(([key, tokens]) => ({ key, tokens }))
      .sort((a, b) => b.tokens - a.tokens);
  };

  const sortedKeys = (totals: Map<string, number>): string[] =>
    Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

  return {
    days: Array.from(days.values())
      .map((entry) => ({
        ...entry,
        projects: mergeSlices(entry.projects),
        models: mergeSlices(entry.models),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    projects: sortedKeys(projectTotals),
    models: sortedKeys(modelTotals),
  };
};

let cachedResult: { response: UsageChartResponse; fetchedAt: number; cacheKey: string } | null =
  null;
const CACHE_TTL_MS = 120_000;

export const scanOpencodeUsageChart = async (
  scope: "all" | "project",
  workspaceCwd: string,
): Promise<UsageChartResponse> => {
  const cacheKey = `${scope}:${workspaceCwd}`;

  if (
    cachedResult &&
    Date.now() - cachedResult.fetchedAt < CACHE_TTL_MS &&
    cachedResult.cacheKey === cacheKey
  ) {
    return cachedResult.response;
  }

  const allProjects = new Set<string>();

  try {
    if (scope === "project") {
      const projectRows = toRows(
        runOpencodeDb(`
          SELECT date(time_created / 1000, 'unixepoch') AS day,
                 directory AS project,
                 model,
                 SUM(tokens_input + tokens_output + tokens_reasoning +
                     tokens_cache_read + tokens_cache_write) AS total_tokens,
                 COUNT(DISTINCT id) AS session_count
          FROM session
          WHERE directory = '${sqlQuote(workspaceCwd)}'
            AND (tokens_input + tokens_output + tokens_reasoning +
                 tokens_cache_read + tokens_cache_write) > 0
          GROUP BY day, directory, model
        `),
      );
      allProjects.add(projectLabelFromDirectory(workspaceCwd));

      const response = aggregateChart(projectRows, allProjects);
      cachedResult = { response, fetchedAt: Date.now(), cacheKey };
      return response;
    }

    const allRows = toRows(
      runOpencodeDb(`
        SELECT date(time_created / 1000, 'unixepoch') AS day,
               directory AS project,
               model,
               SUM(tokens_input + tokens_output + tokens_reasoning +
                   tokens_cache_read + tokens_cache_write) AS total_tokens,
               COUNT(DISTINCT id) AS session_count
        FROM session
        WHERE (tokens_input + tokens_output + tokens_reasoning +
               tokens_cache_read + tokens_cache_write) > 0
        GROUP BY day, directory, model
      `),
    );

    const response = aggregateChart(allRows, allProjects);
    cachedResult = { response, fetchedAt: Date.now(), cacheKey };
    return response;
  } catch {
    const empty: UsageChartResponse = { days: [], projects: [], models: [] };
    cachedResult = { response: empty, fetchedAt: Date.now(), cacheKey };
    return empty;
  }
};
