import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceSetupSnapshot } from "@hydra/core";

import { App } from "../src/App";
import { jsonResponse, notFoundResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

const buildSetupSnapshot = (
  overrides: Partial<WorkspaceSetupSnapshot> = {},
): WorkspaceSetupSnapshot => ({
  isFirstRun: true,
  shouldShowSetupCard: true,
  hasAnyTentacles: false,
  tentacleCount: 0,
  steps: [
    {
      id: "initialize-workspace",
      title: "Initialize workspace",
      description: "Create Hydra project files and runtime directories.",
      complete: false,
      required: true,
      actionLabel: "Initialize workspace",
      statusText: "Create .hydra project files before continuing.",
      guidance: "Workspace initialization failed. Run the Hydra initializer in this repository.",
      command: "hydra init",
    },
    {
      id: "ensure-gitignore",
      title: "Ignore .hydra",
      description: "Add .hydra to .gitignore, or create .gitignore when it is missing.",
      complete: false,
      required: true,
      actionLabel: "Update .gitignore",
      statusText: "Add .hydra to .gitignore before creating tentacles.",
      guidance:
        "Git ignore entry is missing. Create or update .gitignore with the Hydra workspace path.",
      command: "printf '.hydra\\n' >> .gitignore",
    },
    {
      id: "check-opencode",
      title: "Check Opencode",
      description: "Verify the default opencode workflow is available on this machine.",
      complete: true,
      required: false,
      actionLabel: "Check Opencode",
      statusText: "Opencode is available.",
      guidance: null,
      command: null,
    },
    {
      id: "check-git",
      title: "Check Git",
      description: "Verify Git is available for worktree-backed tentacles.",
      complete: true,
      required: false,
      actionLabel: "Check Git",
      statusText: "Git is available.",
      guidance: null,
      command: null,
    },
    {
      id: "check-curl",
      title: "Check curl",
      description: "Verify curl is available for opencode plugin event callbacks.",
      complete: true,
      required: false,
      actionLabel: "Check curl",
      statusText: "curl is available.",
      guidance: null,
      command: null,
    },
    {
      id: "create-tentacles",
      title: "Create tentacles",
      description: "Create at least one tentacle before launching a coding agent.",
      complete: false,
      required: true,
      actionLabel: null,
      statusText: "Create your first tentacle to continue.",
      guidance: "Use the planner or manual creation to add at least one tentacle.",
      command: null,
    },
  ],
  ...overrides,
});

const mockAppRequests = (
  resolveSetup: () => WorkspaceSetupSnapshot,
  options: {
    onEnsureGitignoreStep?: () => WorkspaceSetupSnapshot;
  } = {},
) => {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
      return jsonResponse([]);
    }

    if (url.endsWith("/api/deck/tentacles") && method === "GET") {
      return jsonResponse([]);
    }

    if (url.endsWith("/api/setup") && method === "GET") {
      return jsonResponse(resolveSetup());
    }

    if (url.endsWith("/api/setup/steps/ensure-gitignore") && method === "POST") {
      return jsonResponse(
        options.onEnsureGitignoreStep ? options.onEnsureGitignoreStep() : resolveSetup(),
      );
    }

    if (url.endsWith("/api/opencode/usage") && method === "GET") {
      return jsonResponse({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-02-27T12:00:00.000Z",
        sessionCount: 0,
        costToday: null,
        cost7d: null,
        cost30d: null,
        tokensToday: null,
        tokens7d: null,
        tokens30d: null,
      });
    }

    if (url.endsWith("/api/github/summary") && method === "GET") {
      return jsonResponse({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-02-27T12:00:00.000Z",
        commitsPerDay: [],
      });
    }

    if (url.includes("/api/analytics/usage-heatmap") && method === "GET") {
      return jsonResponse({
        days: [],
        projects: [],
        models: [],
      });
    }

    if (url.endsWith("/api/ui-state") && method === "GET") {
      return jsonResponse({});
    }

    if (url.endsWith("/api/ui-state") && method === "PATCH") {
      return jsonResponse({});
    }

    return notFoundResponse();
  });
};

describe("App workspace setup", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("shows the setup card inside the normal Agents view on a fresh workspace", async () => {
    const currentSetup = buildSetupSnapshot();
    mockAppRequests(() => currentSetup);

    render(<App />);

    expect(await screen.findByLabelText("Workspace setup")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByLabelText("Main content canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas graph view")).toBeInTheDocument();
    expect(screen.getByLabelText("Runtime status strip")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "[1] Agents",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("only marks a setup step complete after the refreshed server snapshot says it is done", async () => {
    let currentSetup = buildSetupSnapshot();
    mockAppRequests(() => currentSetup, {
      onEnsureGitignoreStep: () => {
        currentSetup = buildSetupSnapshot({
          steps: buildSetupSnapshot().steps.map((step) =>
            step.id === "ensure-gitignore"
              ? {
                  ...step,
                  complete: true,
                  statusText: ".gitignore covers .hydra.",
                  guidance: null,
                  command: null,
                }
              : step,
          ),
        });
        return currentSetup;
      },
    });

    render(<App />);

    const setupCard = await screen.findByLabelText("Workspace setup");
    fireEvent.click(within(setupCard).getByRole("button", { name: "Update .gitignore" }));

    await waitFor(() => {
      const gitignoreStep = screen.getByText("Ignore .hydra").closest(".workspace-setup-step");
      expect(gitignoreStep).not.toBeNull();
      expect(within(gitignoreStep as HTMLElement).getByText("Done")).toBeInTheDocument();
    });
  });
});
