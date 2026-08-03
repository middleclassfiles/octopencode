import { useRef } from "react";

import { buildOpencodeUsageUrl } from "../../runtime/runtimeEndpoints";
import { OPENCODE_USAGE_SCAN_INTERVAL_MS } from "../constants";
import type { OpencodeUsageSnapshot } from "../types";
import { normalizeOpencodeUsageSnapshot } from "../usageNormalizers";
import { usePollingData } from "./usePollingData";

const fallback = (): OpencodeUsageSnapshot => ({
  status: "error",
  source: "none",
  fetchedAt: new Date().toISOString(),
});

export const useOpencodeUsagePolling = () => {
  const lastOkRef = useRef<OpencodeUsageSnapshot | null>(null);

  const normalize = (raw: unknown): OpencodeUsageSnapshot | null => {
    const snapshot = normalizeOpencodeUsageSnapshot(raw);
    if (snapshot?.status === "ok") {
      lastOkRef.current = snapshot;
      return snapshot;
    }
    // Keep showing the last successful snapshot until a new "ok" arrives
    return lastOkRef.current ?? snapshot;
  };

  const { data, isLoading, refresh } = usePollingData<OpencodeUsageSnapshot>({
    fetchUrl: buildOpencodeUsageUrl(),
    intervalMs: OPENCODE_USAGE_SCAN_INTERVAL_MS,
    normalize,
    fallback,
  });

  return {
    opencodeUsageSnapshot: data,
    isRefreshingOpencodeUsage: isLoading,
    refreshOpencodeUsage: refresh,
  };
};
