import { execFileSync } from "node:child_process";

import type { OpencodeUsageSnapshot } from "@hydra/core";

export type { OpencodeUsageSnapshot };

type OpencodeUsageDependencies = {
  scope?: "all" | "project";
  projectDirectory?: string;
  runDbQuery?: (sql: string) => unknown;
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

type SessionRow = {
  id?: string | null;
  cost?: number | string | null;
  tokens_input?: number | string | null;
  tokens_output?: number | string | null;
  tokens_reasoning?: number | string | null;
  tokens_cache_read?: number | string | null;
  tokens_cache_write?: number | string | null;
  time_created?: number | string | null;
  directory?: string | null;
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRows = (value: unknown): SessionRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is SessionRow =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
};

const rowTotalTokens = (row: SessionRow): number =>
  toNumber(row.tokens_input) +
  toNumber(row.tokens_output) +
  toNumber(row.tokens_reasoning) +
  toNumber(row.tokens_cache_read) +
  toNumber(row.tokens_cache_write);

const querySessionRows = (deps: OpencodeUsageDependencies): SessionRow[] => {
  const whereClause =
    deps.scope === "project" && deps.projectDirectory
      ? ` WHERE directory = '${deps.projectDirectory.replace(/'/g, "''")}'`
      : "";

  const rows = toRows(
    (deps.runDbQuery ?? runOpencodeDb)(`
      SELECT id, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read,
             tokens_cache_write, time_created, directory
      FROM session
      ${whereClause}
    `),
  );

  // Only count sessions that produced usage (have tokens or cost) so idle
  // bookkeeping sessions do not skew the charts.
  return rows.filter((row) => rowTotalTokens(row) > 0 || toNumber(row.cost) > 0);
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const buildOpencodeUsageSnapshot = (
  rows: SessionRow[],
  fetchedAt: string,
  now: number,
): OpencodeUsageSnapshot => {
  const aggregateWindow = (
    windowMs: number,
  ): { cost: number; tokens: number; sessions: number } => {
    let cost = 0;
    let tokens = 0;
    const sessions = new Set<string>();

    const cutoff = now - windowMs;
    for (const row of rows) {
      const createdMs = toNumber(row.time_created);
      if (createdMs <= 0 || createdMs < cutoff) {
        continue;
      }

      cost += toNumber(row.cost);
      tokens += rowTotalTokens(row);
      sessions.add(String(row.id ?? row.time_created));
    }

    return { cost, tokens, sessions: sessions.size };
  };

  if (rows.length === 0) {
    return {
      status: "ok",
      fetchedAt,
      source: "local-db",
      sessionCount: 0,
      costToday: 0,
      cost7d: 0,
      cost30d: 0,
      tokensToday: 0,
      tokens7d: 0,
      tokens30d: 0,
    };
  }

  const today = aggregateWindow(DAY_MS);
  const sevenDays = aggregateWindow(7 * DAY_MS);
  const thirtyDays = aggregateWindow(30 * DAY_MS);

  return {
    status: "ok",
    fetchedAt,
    source: "local-db",
    sessionCount: thirtyDays.sessions,
    costToday: roundCost(today.cost),
    cost7d: roundCost(sevenDays.cost),
    cost30d: roundCost(thirtyDays.cost),
    tokensToday: today.tokens,
    tokens7d: sevenDays.tokens,
    tokens30d: thirtyDays.tokens,
  };
};

export const readOpencodeUsageSnapshot = async (
  deps: OpencodeUsageDependencies = {},
): Promise<OpencodeUsageSnapshot> => {
  const fetchedAt = new Date().toISOString();
  const now = Date.now();

  try {
    const rows = querySessionRows(deps);
    return buildOpencodeUsageSnapshot(rows, fetchedAt, now);
  } catch {
    return {
      status: "unavailable",
      fetchedAt,
      source: "none",
      message:
        "Unable to read the opencode session database. Ensure `opencode` is installed and available on PATH.",
    };
  }
};

const roundCost = (value: number): number => Math.round(value * 10000) / 10000;

export const invalidateUsageCache = () => {
  // Usage is read directly from the opencode session database on every
  // request, so there is nothing to invalidate. Kept as a no-op so the
  // server bootstrapping contract stays stable.
};
