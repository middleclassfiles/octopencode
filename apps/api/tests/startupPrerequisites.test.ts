import { describe, expect, it } from "vitest";

import { collectStartupPrerequisiteReport, isCommandAvailable } from "../src/startupPrerequisites";

describe("collectStartupPrerequisiteReport", () => {
  it("errors when opencode is missing", () => {
    const report = collectStartupPrerequisiteReport(() => false);

    expect(report.errors.length).toBe(1);
    expect(report.errors[0]?.command).toBe("opencode");
    expect(report.errors[0]?.summary).toContain("`opencode` is not installed");
  });

  it("warns for optional tooling when opencode is present", () => {
    const report = collectStartupPrerequisiteReport((command) => command === "opencode");

    expect(report.errors.length).toBe(0);
    expect(report.warnings.map((issue) => issue.command)).toEqual(["git", "gh", "curl"]);
  });

  it("formats warnings with opencode event delivery guidance", () => {
    const report = collectStartupPrerequisiteReport((command) => command === "opencode");
    const lines = report.warnings
      .filter((issue) => issue.command === "curl")
      .flatMap((issue) => [issue.summary, issue.guidance]);

    expect(lines.join("\n")).toContain("Opencode plugin event callbacks");
  });

  it("resolves commands on the current platform", () => {
    const windowsAvailable = isCommandAvailable("opencode", {
      platform: "win32",
      execFileSyncImpl: (() => {
        throw new Error("not found");
      }) as never,
    });
    expect(windowsAvailable).toBe(false);

    const unixAvailable = isCommandAvailable("opencode", {
      platform: "linux",
      execFileSyncImpl: (() => {
        throw new Error("not found");
      }) as never,
    });
    expect(unixAvailable).toBe(false);
  });

  it("checks the right lookup binary per platform", () => {
    const calls: string[][] = [];
    const execFileSyncImpl = ((file: string, args: string[]) => {
      calls.push([file, ...args]);
    }) as never;

    isCommandAvailable("opencode", { platform: "win32", execFileSyncImpl });
    isCommandAvailable("opencode", { platform: "darwin", execFileSyncImpl });

    expect(calls[0]).toEqual(["where", "opencode"]);
    expect(calls[1]).toEqual(["which", "opencode"]);
  });
});
