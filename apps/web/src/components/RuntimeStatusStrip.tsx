import { useEffect, useMemo, useRef, useState } from "react";

import { GITHUB_SPARKLINE_HEIGHT, GITHUB_SPARKLINE_WIDTH } from "../app/constants";
import type { UsageChartData } from "../app/hooks/useUsageHeatmapPolling";
import type { OpencodeUsageSnapshot } from "../app/types";
import { OctopusGlyph } from "./EmptyOctopus";

type RuntimeStatusStripProps = {
  sparklinePoints: string;
  usageData: UsageChartData | null;
  opencodeUsage: OpencodeUsageSnapshot | null;
  isRefreshingOpencodeUsage?: boolean;
  onRefreshOpencodeUsage?: () => void;
};

const MINI_USAGE_WIDTH = 160;
const MINI_USAGE_HEIGHT = 28;
const MINI_BAR_GAP = 1;

type MiniBar = { x: number; y: number; width: number; height: number };

const buildUsageBars = (data: UsageChartData): MiniBar[] => {
  const days = Array.isArray(data.days) ? data.days.slice(-30) : [];
  if (days.length === 0) return [];

  const totals = days.map((day) => (typeof day.totalTokens === "number" ? day.totalTokens : 0));
  const max = Math.max(...totals, 1);
  const barSlot = MINI_USAGE_WIDTH / days.length;
  const barWidth = Math.max(1, barSlot - MINI_BAR_GAP);

  return days.map((day, index) => {
    const totalTokens = typeof day.totalTokens === "number" ? day.totalTokens : 0;
    const h = Math.max(0.5, (totalTokens / max) * (MINI_USAGE_HEIGHT - 2));
    return {
      x: index * barSlot,
      y: MINI_USAGE_HEIGHT - h,
      width: barWidth,
      height: h,
    };
  });
};

const formatCost = (value: number | null | undefined): string => {
  if (value == null) return "NA";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

const sharePercent = (part: number | null | undefined, total: number | null | undefined): number =>
  part == null || total == null || total <= 0 ? 0 : Math.min(100, (part / total) * 100);

const usageState = (
  usage: OpencodeUsageSnapshot | null,
): {
  label: string;
  loading: boolean;
  sessionLabel: string;
  sessionPercent: number;
  weekLabel: string;
  weekPercent: number;
  message?: string;
} => {
  if (usage === null) {
    return {
      label: "Usage",
      loading: true,
      sessionLabel: "···",
      sessionPercent: 0,
      weekLabel: "···",
      weekPercent: 0,
    };
  }

  if (usage.status === "ok") {
    return {
      label: "Usage",
      loading: false,
      sessionLabel: `${formatCost(usage.costToday)} · ${usage.sessionCount ?? 0} sessions`,
      sessionPercent: sharePercent(usage.costToday, usage.cost7d),
      weekLabel: formatCost(usage.cost7d),
      weekPercent: sharePercent(usage.cost7d, usage.cost30d),
    };
  }

  return {
    label: "Usage",
    loading: false,
    sessionLabel: "NA",
    sessionPercent: 0,
    weekLabel: "NA",
    weekPercent: 0,
    message: usage.message ?? "Opencode usage unavailable",
  };
};

const UsageRail = ({
  label,
  percent,
  valueLabel,
  loading,
  title,
}: {
  label: string;
  percent: number;
  valueLabel: string;
  loading?: boolean;
  title?: string;
}) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  const showTooltip = (clientX: number, clientY: number) => {
    if (!title) return;
    setTooltip({ x: clientX, y: clientY });
  };

  return (
    <div
      className="console-status-usage-row"
      data-has-tooltip={title ? "true" : undefined}
      tabIndex={title ? 0 : -1}
      onMouseEnter={(event) => showTooltip(event.clientX, event.clientY)}
      onMouseMove={(event) => showTooltip(event.clientX, event.clientY)}
      onMouseLeave={() => setTooltip(null)}
      onBlur={() => setTooltip(null)}
      onFocus={(event) => {
        if (!title) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setTooltip({ x: rect.left + 24, y: rect.bottom + 8 });
      }}
    >
      <span className="console-status-usage-row-meta">
        <span className="console-status-usage-row-label">{label}</span>
        <span className="console-status-usage-row-value">{loading ? "···" : valueLabel}</span>
      </span>
      <span className="console-status-usage-rail">
        <span
          className="console-status-usage-rail-fill"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </span>
      {title && tooltip ? (
        <span
          className="console-status-usage-tooltip"
          style={{
            left: `${Math.max(8, tooltip.x - 260)}px`,
            top: `${Math.min(window.innerHeight - 80, tooltip.y + 14)}px`,
          }}
        >
          {title}
        </span>
      ) : null}
    </div>
  );
};

export const RuntimeStatusStrip = ({
  sparklinePoints,
  usageData,
  opencodeUsage,
  isRefreshingOpencodeUsage = false,
  onRefreshOpencodeUsage,
}: RuntimeStatusStripProps) => {
  const usageBars = useMemo(() => (usageData ? buildUsageBars(usageData) : []), [usageData]);
  const opencodeUsageState = usageState(opencodeUsage);
  const [showRefreshSpin, setShowRefreshSpin] = useState(false);
  const refreshStartedAtRef = useRef<number | null>(null);
  const refreshHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (refreshHideTimerRef.current !== null) {
        window.clearTimeout(refreshHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRefreshingOpencodeUsage) {
      if (refreshHideTimerRef.current !== null) {
        window.clearTimeout(refreshHideTimerRef.current);
        refreshHideTimerRef.current = null;
      }
      refreshStartedAtRef.current = Date.now();
      setShowRefreshSpin(true);
      return;
    }

    if (refreshStartedAtRef.current === null) {
      setShowRefreshSpin(false);
      return;
    }

    const elapsedMs = Date.now() - refreshStartedAtRef.current;
    const remainingMs = Math.max(0, 450 - elapsedMs);
    refreshHideTimerRef.current = window.setTimeout(() => {
      setShowRefreshSpin(false);
      refreshStartedAtRef.current = null;
      refreshHideTimerRef.current = null;
    }, remainingMs);
  }, [isRefreshingOpencodeUsage]);

  return (
    <section className="console-status-strip" aria-label="Runtime status strip">
      <div className="console-status-main">
        <OctopusGlyph
          className="console-status-octopus-icon"
          animation="sway"
          expression="normal"
          scale={2}
        />
        <span className="console-status-brand">HYDRA</span>
      </div>
      <div className="console-status-charts">
        <div className="console-status-sparkline" aria-label="Commits per day over last 30 days">
          <div className="console-status-sparkline-chart">
            <svg
              viewBox={`0 0 ${GITHUB_SPARKLINE_WIDTH} ${GITHUB_SPARKLINE_HEIGHT}`}
              role="presentation"
            >
              <polyline points={sparklinePoints} />
            </svg>
          </div>
          <span className="console-status-sparkline-label">COMMITS/DAY · LAST 30 DAYS</span>
        </div>
        <div className="console-status-usage-mini" aria-label="Opencode token usage last 30 days">
          {usageBars.length > 0 ? (
            <>
              <div className="console-status-usage-mini-chart">
                <svg viewBox={`0 0 ${MINI_USAGE_WIDTH} ${MINI_USAGE_HEIGHT}`} role="presentation">
                  {usageBars.map((bar, index) => (
                    <rect
                      key={`${index}-${bar.x}-${bar.height}`}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={0.5}
                    />
                  ))}
                </svg>
              </div>
              <span className="console-status-sparkline-label">
                OPENCODE TOKENS/DAY · LAST 30 DAYS
              </span>
            </>
          ) : (
            <span className="console-status-sparkline-label">OPENCODE USAGE —</span>
          )}
        </div>
      </div>
      <div className="console-status-opencode-usage" aria-label="Opencode usage limits">
        {onRefreshOpencodeUsage && (
          <button
            type="button"
            className="console-status-opencode-usage-refresh"
            onClick={onRefreshOpencodeUsage}
            aria-label="Refresh opencode usage"
            title="Refresh opencode usage"
            data-refreshing={showRefreshSpin ? "true" : "false"}
          >
            ↻
          </button>
        )}
        <span className="console-status-opencode-usage-title">
          OPENCODE
          <br />
          USAGE
        </span>
        <div className="console-status-opencode-usage-bars">
          <UsageRail
            label="Today"
            percent={opencodeUsageState.sessionPercent}
            valueLabel={opencodeUsageState.sessionLabel}
            loading={opencodeUsageState.loading}
            {...(opencodeUsageState.message ? { title: opencodeUsageState.message } : {})}
          />
          <UsageRail
            label="7 days"
            percent={opencodeUsageState.weekPercent}
            valueLabel={opencodeUsageState.weekLabel}
            loading={opencodeUsageState.loading}
            {...(opencodeUsageState.message ? { title: opencodeUsageState.message } : {})}
          />
        </div>
      </div>
    </section>
  );
};
