import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { WorkspaceSetupSnapshot, WorkspaceSetupStep } from "@hydra/core";

import { readDeckTentacles } from "./deck/readDeckTentacles";
import {
  deriveProjectIdFromWorkspace,
  ensureHydraGitignoreEntry,
  ensureProjectScaffold,
  hasHydraGitignoreEntry,
  loadProjectConfig,
  migrateStateToGlobal,
  registerProject,
} from "./projectPersistence";
import { readSetupState } from "./setupState";
import { collectStartupPrerequisiteReport } from "./startupPrerequisites";

export const initializeWorkspaceFiles = (workspaceCwd: string, projectStateDir: string) => {
  const projectName = loadProjectConfig(workspaceCwd)?.displayName;
  const projectConfig = ensureProjectScaffold(
    workspaceCwd,
    projectName,
    deriveProjectIdFromWorkspace(workspaceCwd),
  );
  registerProject(workspaceCwd, projectConfig.displayName);
  mkdirSync(join(projectStateDir, "state"), { recursive: true });
  migrateStateToGlobal(workspaceCwd, projectStateDir);

  return { projectConfig, projectStateDir };
};

export const ensureWorkspaceGitignore = (workspaceCwd: string) =>
  ensureHydraGitignoreEntry(workspaceCwd);

export const readWorkspaceSetupSnapshot = (
  workspaceCwd: string,
  projectStateDir: string,
): WorkspaceSetupSnapshot => {
  const prerequisites = collectStartupPrerequisiteReport();
  const projectConfig = loadProjectConfig(workspaceCwd);
  const hydraDir = join(workspaceCwd, ".hydra");
  const hasProjectScaffold =
    projectConfig !== null &&
    existsSync(join(hydraDir, "tentacles")) &&
    existsSync(join(hydraDir, "worktrees")) &&
    existsSync(join(projectStateDir, "state"));
  const hasGitignore = hasHydraGitignoreEntry(workspaceCwd);
  const tentacles = readDeckTentacles(workspaceCwd, projectStateDir);
  const tentacleCount = tentacles.length;
  const hasAnyTentacles = tentacleCount > 0;
  const setupState = readSetupState(projectStateDir);
  const isFirstRun = !hasAnyTentacles && !setupState.tentaclesInitializedAt;
  const verifiedSteps = setupState.verifiedSteps ?? {};
  const isOpencodeVerified = Boolean(verifiedSteps["check-opencode"]);
  const isGitVerified = Boolean(verifiedSteps["check-git"]);
  const isCurlVerified = Boolean(verifiedSteps["check-curl"]);
  const hasOpencode = prerequisites.availability.opencode;
  const hasGit = prerequisites.availability.git;
  const hasCurl = prerequisites.availability.curl;

  const steps: WorkspaceSetupStep[] = [
    {
      id: "initialize-workspace",
      title: "Initialize workspace",
      description: "Create Hydra project files and runtime directories.",
      complete: hasProjectScaffold,
      required: true,
      actionLabel: "Initialize workspace",
      statusText: hasProjectScaffold
        ? "Workspace files are ready."
        : "Create .hydra project files before continuing.",
      guidance: hasProjectScaffold
        ? null
        : "Workspace initialization failed. Run the Hydra initializer in this repository.",
      command: hasProjectScaffold ? null : "hydra init",
    },
    {
      id: "ensure-gitignore",
      title: "Ignore .hydra",
      description: "Add .hydra to .gitignore, or create .gitignore when it is missing.",
      complete: hasGitignore,
      required: true,
      actionLabel: "Update .gitignore",
      statusText: hasGitignore
        ? ".gitignore covers .hydra."
        : "Add .hydra to .gitignore before creating tentacles.",
      guidance: hasGitignore
        ? null
        : "Git ignore entry is missing. Create or update .gitignore with the Hydra workspace path.",
      command: hasGitignore ? null : "printf '.hydra\\n' >> .gitignore",
    },
    {
      id: "check-opencode",
      title: "Check Opencode",
      description: "Verify the default opencode workflow is available on this machine.",
      complete: hasOpencode && isOpencodeVerified,
      required: false,
      actionLabel: "Check Opencode",
      statusText: hasOpencode
        ? isOpencodeVerified
          ? "Opencode is available."
          : "Confirm Opencode before using the planner."
        : "Opencode is unavailable.",
      guidance: hasOpencode
        ? isOpencodeVerified
          ? null
          : "Click to verify the opencode workflow on this machine."
        : "Install opencode (https://opencode.ai) and log in before using the default workflow.",
      command: hasOpencode ? null : "opencode",
    },
    {
      id: "check-git",
      title: "Check Git",
      description: "Verify Git is available for worktree-backed tentacles.",
      complete: hasGit && isGitVerified,
      required: false,
      actionLabel: "Check Git",
      statusText: hasGit
        ? isGitVerified
          ? "Git is available."
          : "Confirm Git before launching worktree-backed tentacles."
        : "Git is unavailable.",
      guidance: hasGit
        ? isGitVerified
          ? null
          : "Click to verify Git support for worktree terminal flows."
        : "Install Git to enable worktree terminals and branch flows.",
      command: hasGit ? null : "git --version",
    },
    {
      id: "check-curl",
      title: "Check curl",
      description: "Verify curl is available for opencode plugin event delivery.",
      complete: hasCurl && isCurlVerified,
      required: false,
      actionLabel: "Check curl",
      statusText: hasCurl
        ? isCurlVerified
          ? "curl is available."
          : "Confirm curl before using event delivery."
        : "curl is unavailable.",
      guidance: hasCurl
        ? isCurlVerified
          ? null
          : "Click to verify event delivery support on this machine."
        : "Install curl to restore opencode event delivery.",
      command: hasCurl ? null : "curl --version",
    },
    {
      id: "create-tentacles",
      title: "Create tentacles",
      description: "Create at least one tentacle before launching a coding agent.",
      complete: hasAnyTentacles,
      required: true,
      actionLabel: null,
      statusText: hasAnyTentacles
        ? `${tentacleCount} tentacle${tentacleCount === 1 ? "" : "s"} ready.`
        : "Create your first tentacle to continue.",
      guidance: hasAnyTentacles
        ? null
        : "Use the planner or manual creation to add at least one tentacle.",
      command: null,
    },
  ];

  return {
    isFirstRun,
    shouldShowSetupCard: isFirstRun || (!hasAnyTentacles && (!hasProjectScaffold || !hasGitignore)),
    hasAnyTentacles,
    tentacleCount,
    steps,
  };
};
