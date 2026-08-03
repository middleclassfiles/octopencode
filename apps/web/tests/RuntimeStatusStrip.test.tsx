import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RuntimeStatusStrip } from "../src/components/RuntimeStatusStrip";

describe("RuntimeStatusStrip", () => {
  it("shows loading placeholders before opencode usage loads", () => {
    render(<RuntimeStatusStrip sparklinePoints="" usageData={null} opencodeUsage={null} />);

    const usage = screen.getByLabelText("Opencode usage limits");
    expect(within(usage).getAllByText("···")).toHaveLength(2);
  });

  it("shows today cost and session count for local-db-backed usage", () => {
    render(
      <RuntimeStatusStrip
        sparklinePoints=""
        usageData={null}
        opencodeUsage={{
          status: "ok",
          source: "local-db",
          fetchedAt: "2026-04-09T10:00:00.000Z",
          sessionCount: 3,
          costToday: 0.12,
          cost7d: 1.5,
          cost30d: 5.2,
          tokensToday: 150000,
          tokens7d: 1900000,
          tokens30d: 6800000,
        }}
      />,
    );

    const usage = screen.getByLabelText("Opencode usage limits");
    expect(within(usage).getByText("$0.12 · 3 sessions")).toBeInTheDocument();
    expect(within(usage).getByText("$1.50")).toBeInTheDocument();
  });

  it("shows unavailable values instead of a permanent loading state", () => {
    render(
      <RuntimeStatusStrip
        sparklinePoints=""
        usageData={null}
        opencodeUsage={{
          status: "unavailable",
          source: "none",
          fetchedAt: "2026-04-09T10:00:00.000Z",
          sessionCount: 0,
          costToday: null,
          cost7d: null,
          cost30d: null,
          tokensToday: null,
          tokens7d: null,
          tokens30d: null,
          message: "No opencode sessions found.",
        }}
      />,
    );

    const usage = screen.getByLabelText("Opencode usage limits");
    expect(within(usage).getAllByText("NA")).toHaveLength(2);
    expect(within(usage).queryByText("···")).toBeNull();
  });

  it("marks the refresh button as rotating while opencode usage is refreshing", () => {
    render(
      <RuntimeStatusStrip
        sparklinePoints=""
        usageData={null}
        opencodeUsage={null}
        isRefreshingOpencodeUsage
        onRefreshOpencodeUsage={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Refresh opencode usage" })).toHaveAttribute(
      "data-refreshing",
      "true",
    );
  });
});
