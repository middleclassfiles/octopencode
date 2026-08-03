import { describe, expect, it } from "vitest";

import { buildOpencodeUsageSnapshot, readOpencodeUsageSnapshot } from "../src/opencodeUsage";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-08-04T12:00:00Z").getTime();

const sessionRow = (
  overrides: {
    id?: string;
    cost?: number;
    tokens?: number;
    time_created?: number;
  } = {},
) => ({
  id: overrides.id ?? `session-${Math.random().toString(36).slice(2)}`,
  cost: overrides.cost ?? 0,
  tokens_input: overrides.tokens ?? 0,
  tokens_output: 0,
  tokens_reasoning: 0,
  tokens_cache_read: 0,
  tokens_cache_write: 0,
  time_created: overrides.time_created ?? now,
  directory: "C:\\dev\\demo",
});

describe("buildOpencodeUsageSnapshot", () => {
  it("returns an empty ok snapshot when there are no sessions", () => {
    const snapshot = buildOpencodeUsageSnapshot([], new Date(now).toISOString(), now);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.sessionCount).toBe(0);
    expect(snapshot.costToday).toBe(0);
    expect(snapshot.cost7d).toBe(0);
    expect(snapshot.cost30d).toBe(0);
    expect(snapshot.tokensToday).toBe(0);
  });

  it("aggregates cost and tokens within the today window", () => {
    const rows = [
      sessionRow({ id: "a", cost: 1.25, tokens: 1000, time_created: now - 60_000 }),
      sessionRow({ id: "b", cost: 0.75, tokens: 500, time_created: now - DAY_MS + 1 }),
    ];
    const snapshot = buildOpencodeUsageSnapshot(rows, new Date(now).toISOString(), now);

    expect(snapshot.costToday).toBe(2);
    expect(snapshot.tokensToday).toBe(1500);
    expect(snapshot.cost7d).toBe(2);
    expect(snapshot.cost30d).toBe(2);
    expect(snapshot.sessionCount).toBe(2);
  });

  it("excludes sessions older than the 30-day window", () => {
    const rows = [
      sessionRow({ id: "a", cost: 5, tokens: 1000, time_created: now - 31 * DAY_MS }),
      sessionRow({ id: "b", cost: 1, tokens: 200, time_created: now - 5 * DAY_MS }),
    ];
    const snapshot = buildOpencodeUsageSnapshot(rows, new Date(now).toISOString(), now);

    expect(snapshot.cost30d).toBe(1);
    expect(snapshot.tokens30d).toBe(200);
    expect(snapshot.sessionCount).toBe(1);
  });

  it("counts each session id once even across window buckets", () => {
    const rows = [
      sessionRow({ id: "a", tokens: 100, time_created: now - 60_000 }),
      sessionRow({ id: "a", tokens: 50, time_created: now - 2 * DAY_MS }),
    ];
    const snapshot = buildOpencodeUsageSnapshot(rows, new Date(now).toISOString(), now);

    expect(snapshot.sessionCount).toBe(1);
    expect(snapshot.tokens7d).toBe(150);
  });

  it("rounds costs to 4 decimal places", () => {
    const rows = [sessionRow({ id: "a", cost: 0.123456789, tokens: 1, time_created: now })];
    const snapshot = buildOpencodeUsageSnapshot(rows, new Date(now).toISOString(), now);

    expect(snapshot.costToday).toBe(0.1235);
  });
});

describe("readOpencodeUsageSnapshot", () => {
  it("returns ok with the aggregated snapshot from the injected query", async () => {
    const runDbQuery = () => [
      sessionRow({ id: "a", cost: 0.5, tokens: 250, time_created: now - 60_000 }),
    ];
    const snapshot = await readOpencodeUsageSnapshot({ runDbQuery });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("local-db");
    expect(snapshot.tokensToday).toBe(250);
    expect(snapshot.costToday).toBe(0.5);
  });

  it("filters out sessions with no tokens or cost", async () => {
    const runDbQuery = () => [
      sessionRow({ id: "a", cost: 0, tokens: 0, time_created: now - 60_000 }),
      sessionRow({ id: "b", cost: 1, tokens: 0, time_created: now - 60_000 }),
    ];
    const snapshot = await readOpencodeUsageSnapshot({ runDbQuery });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.sessionCount).toBe(1);
    expect(snapshot.tokensToday).toBe(0);
    expect(snapshot.costToday).toBe(1);
  });

  it("returns unavailable when the query throws", async () => {
    const runDbQuery = () => {
      throw new Error("opencode not found");
    };
    const snapshot = await readOpencodeUsageSnapshot({ runDbQuery });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.source).toBe("none");
    expect(snapshot.message).toContain("opencode");
  });
});
