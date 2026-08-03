import { asNumber, asRecord, asString } from "@hydra/core";

import type { OpencodeUsageSnapshot } from "./types";

export const normalizeOpencodeUsageSnapshot = (value: unknown): OpencodeUsageSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = record.status;
  if (status !== "ok" && status !== "unavailable" && status !== "error") {
    return null;
  }

  const source = record.source === "local-db" ? "local-db" : "none";
  return {
    status,
    source,
    fetchedAt: asString(record.fetchedAt) ?? new Date().toISOString(),
    message: asString(record.message),
    sessionCount: asNumber(record.sessionCount),
    costToday: asNumber(record.costToday),
    cost7d: asNumber(record.cost7d),
    cost30d: asNumber(record.cost30d),
    tokensToday: asNumber(record.tokensToday),
    tokens7d: asNumber(record.tokens7d),
    tokens30d: asNumber(record.tokens30d),
  };
};
