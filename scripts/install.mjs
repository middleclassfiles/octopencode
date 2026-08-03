#!/usr/bin/env node
/**
 * Hydra one-click installer.
 *
 * Checks prerequisites (Node.js, pnpm, opencode, git, gh, curl), installs
 * anything missing that can be installed automatically, builds the package,
 * installs the `hydra` CLI globally, and verifies the result.
 *
 * Usage:
 *   node scripts/install.mjs                 interactive (confirms auto-installs)
 *   node scripts/install.mjs --yes           assume yes for every prompt
 *   node scripts/install.mjs --skip-build    build/global-install only when needed
 *   node scripts/install.mjs --check         only report prerequisite status
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const MIN_NODE_MAJOR = 22;

const args = process.argv.slice(2);
const FLAG_YES = args.includes("--yes") || args.includes("-y");
const FLAG_CHECK = args.includes("--check");
const FLAG_SKIP_BUILD = args.includes("--skip-build");

const out = (message) => console.log(message);
const ok = (message) => console.log(`  \u2714 ${message}`);
const warn = (message) => console.log(`  \u26a0 ${message}`);
const fail = (message) => console.log(`  \u2716 ${message}`);
const hr = () => console.log("");

const readline = createInterface({ input: process.stdin, output: process.stdout });

const confirm = async (question) => {
  if (FLAG_YES) {
    return true;
  }
  return new Promise((resolve) => {
    readline.question(`${question} [y/N] `, (answer) => {
      resolve(/^(y|yes)$/i.test(answer.trim()));
    });
  });
};

// npm/pnpm/opencode/hydra install as .cmd shims on Windows and cannot be
// spawned directly; everything else (node, git, gh, curl, winget) is a real
// executable and must be spawned without a shell.
const WINDOWS_CMD_SHIMS = new Set(["npm", "npx", "pnpm", "corepack", "yarn", "opencode", "hydra"]);
const needsWindowsShell = (command) => isWindows && WINDOWS_CMD_SHIMS.has(command.toLowerCase());

const run = (command, argsList, options = {}) => {
  if (needsWindowsShell(command)) {
    // npm/pnpm/opencode are .cmd shims on Windows and cannot be spawned
    // directly. Route them through cmd.exe with the command line we build
    // ourselves, avoiding the deprecated `shell: true` + args path.
    const quote = (part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part);
    const fullCommand = [command, ...argsList].map(quote).join(" ");
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", fullCommand], {
      encoding: "utf8",
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    });
  }
  return spawnSync(command, argsList, {
    encoding: "utf8",
    stdio: options.silent ? "pipe" : "inherit",
    ...options,
  });
};

const runChecked = (command, argsList, options = {}) => {
  const result = run(command, argsList, { silent: true, ...options });
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${argsList.join(" ")}`,
        result.stdout ? `stdout:\n${result.stdout.trimEnd()}` : "",
        result.stderr ? `stderr:\n${result.stderr.trimEnd()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return result.stdout.trim();
};

const commandExists = (command) => {
  const lookup = isWindows ? "where" : "which";
  const result = spawnSync(lookup, [command], { encoding: "utf8", stdio: "pipe" });
  return result.status === 0;
};

const isWindows = process.platform === "win32";

const npmGlobalBin = () => {
  const result = run("npm", ["prefix", "-g"], { silent: true });
  if (result.status !== 0) {
    return null;
  }
  return join(result.stdout.trim(), isWindows ? "" : "bin");
};

const getPathValue = () => process.env.PATH ?? "";

const commandOnPath = (command) =>
  getPathValue()
    .split(delimiter)
    .some((entry) => {
      if (!entry) {
        return false;
      }
      const candidate = isWindows ? join(entry, `${command}.cmd`) : join(entry, command);
      return existsSync(candidate);
    });

const parseNodeMajor = (versionOutput) => {
  const match = /v?(\d+)\./.exec(versionOutput);
  return match ? Number.parseInt(match[1], 10) : 0;
};

const nodeMajor = () => {
  const result = run("node", ["--version"], { silent: true });
  if (result.status !== 0) {
    return 0;
  }
  return parseNodeMajor(result.stdout);
};

// ─── Prerequisite report ───────────────────────────────────────────────────

const buildReport = () => {
  const report = {
    node: { present: false, autoInstallable: false, installHint: "" },
    pnpm: { present: false, autoInstallable: false, installHint: "" },
    opencode: { present: false, autoInstallable: false, installHint: "" },
    git: { present: false, autoInstallable: false, installHint: "" },
    gh: { present: false, autoInstallable: false, installHint: "" },
    curl: { present: false, autoInstallable: false, installHint: "" },
  };

  const major = nodeMajor();
  report.node.present = major >= MIN_NODE_MAJOR;
  if (isWindows) {
    report.node.autoInstallable = commandExists("winget");
    report.node.installHint = "winget install OpenJS.NodeJS.LTS";
  } else {
    report.node.autoInstallable =
      commandExists("brew") || commandExists("apt-get") || commandExists("dnf");
    report.node.installHint = "Install Node.js 22+ from https://nodejs.org";
  }

  report.pnpm.present = commandExists("pnpm");
  report.pnpm.autoInstallable = report.node.present;
  report.pnpm.installHint = "npm install -g pnpm@10";

  report.opencode.present = commandExists("opencode");
  report.opencode.autoInstallable = report.node.present;
  report.opencode.installHint = "npm install -g opencode-ai";

  report.git.present = commandExists("git");
  if (isWindows) {
    report.git.autoInstallable = commandExists("winget");
    report.git.installHint = "winget install Git.Git";
  } else {
    report.git.autoInstallable =
      commandExists("brew") || commandExists("apt-get") || commandExists("dnf");
    report.git.installHint = "Install Git from https://git-scm.com";
  }

  report.gh.present = commandExists("gh");
  if (isWindows) {
    report.gh.autoInstallable = commandExists("winget");
    report.gh.installHint = "winget install GitHub.cli";
  } else {
    report.gh.autoInstallable =
      commandExists("brew") || commandExists("apt-get") || commandExists("dnf");
    report.gh.installHint = "Install the GitHub CLI from https://cli.github.com";
  }

  report.curl.present = commandExists("curl");
  if (isWindows) {
    report.curl.autoInstallable = commandExists("winget");
    report.curl.installHint = "winget install curl.curl";
  } else {
    report.curl.autoInstallable = false;
    report.curl.installHint = "Install curl through your package manager";
  }

  return report;
};

const requiredKeys = ["node", "pnpm", "opencode"];
const optionalKeys = ["git", "gh", "curl"];

const printReport = (report) => {
  out("Prerequisite check:");
  for (const key of [...requiredKeys, ...optionalKeys]) {
    const entry = report[key];
    if (entry.present) {
      ok(`${key} (${key === "node" ? `v${nodeMajor()}+` : "found"})`);
    } else {
      warn(`${key} missing \u2014 ${entry.installHint}`);
    }
  }
  hr();
};

const installViaWinget = async (packageId) => {
  out(`  Installing ${packageId} via winget...`);
  const result = run("winget", [
    "install",
    "--id",
    packageId,
    "--accept-source-agreements",
    "--accept-package-agreements",
    "--silent",
  ]);
  return result.status === 0;
};

const installViaNpmGlobal = async (packageName) => {
  out(`  Installing ${packageName} via npm...`);
  const result = run("npm", ["install", "-g", packageName], { silent: true });
  if (result.status !== 0) {
    out(result.stderr ?? "");
    return false;
  }
  return true;
};

// ─── Auto-install steps ─────────────────────────────────────────────────────

const ensureNode = async (report) => {
  if (report.node.present) {
    return true;
  }
  out("Node.js 22+ is required and was not found.");
  if (!report.node.autoInstallable) {
    out(`Install Node.js 22+ (${report.node.installHint}) and run this installer again.`);
    return false;
  }
  if (await confirm("Install Node.js LTS automatically?")) {
    if (isWindows && (await installViaWinget("OpenJS.NodeJS.LTS"))) {
      return true;
    }
    out("Node.js installation finished or failed; open a new terminal and re-run this installer.");
    return false;
  }
  return false;
};

const ensurePnpm = async (report) => {
  if (report.pnpm.present) {
    return true;
  }
  if (!report.pnpm.autoInstallable) {
    out(`pnpm is required. ${report.pnpm.installHint}, then re-run this installer.`);
    return false;
  }
  if (await confirm("Install pnpm automatically?")) {
    return installViaNpmGlobal("pnpm@10");
  }
  return false;
};

const ensureOpencode = async (report) => {
  if (report.opencode.present) {
    return true;
  }
  out("opencode is required \u2014 Hydra runs opencode sessions in each terminal.");
  if (!report.opencode.autoInstallable) {
    out(`Install opencode (${report.opencode.installHint}) and re-run this installer.`);
    return false;
  }
  if (await confirm("Install opencode automatically?")) {
    return installViaNpmGlobal("opencode-ai");
  }
  return false;
};

const ensureOptional = async (report) => {
  const missingOptional = optionalKeys.filter((key) => !report[key].present);
  if (missingOptional.length === 0) {
    return;
  }

  warn(`Optional integrations missing: ${missingOptional.join(", ")}`);
  if (!(await confirm("Install missing optional integrations automatically?"))) {
    warn("Continuing without them. Hydra will still run; these features are degraded:");
    for (const key of missingOptional) {
      out(`    - ${key}: ${report[key].installHint}`);
    }
    return;
  }

  for (const key of missingOptional) {
    const entry = report[key];
    if (!entry.autoInstallable) {
      warn(`Cannot auto-install ${key} \u2014 ${entry.installHint}`);
      continue;
    }
    if (isWindows) {
      const packageId = key === "git" ? "Git.Git" : key === "gh" ? "GitHub.cli" : "curl.curl";
      if (!(await installViaWinget(packageId))) {
        warn(`Failed to install ${key} via winget.`);
      }
    } else if (key === "git") {
      warn(`Install Git (${entry.installHint}) to enable worktree terminals.`);
    } else if (key === "gh") {
      warn(`Install the GitHub CLI (${entry.installHint}) to enable PR features.`);
    } else if (key === "curl") {
      warn(`Install curl (${entry.installHint}) for plugin event callbacks.`);
    }
  }
};

// ─── Build and global install ───────────────────────────────────────────────

const buildAndInstall = async () => {
  out("Installing dependencies (pnpm install)...");
  runChecked("pnpm", ["install"], { cwd: repoRoot });

  if (!FLAG_SKIP_BUILD) {
    out("Building Hydra (pnpm build)...");
    runChecked("pnpm", ["build"], { cwd: repoRoot });
  }

  out("Installing the `hydra` CLI globally (npm install -g .)...");
  runChecked("npm", ["install", "-g", "."], { cwd: repoRoot });

  const hydraOnPath = commandOnPath("hydra") || commandExists("hydra");
  if (!hydraOnPath) {
    const binDir = npmGlobalBin();
    warn(`The hydra CLI was installed to ${binDir ?? "the npm global bin directory"}.`);
    warn("Add that directory to your PATH (or open a new terminal) and re-run: hydra");
    return false;
  }
  return true;
};

const verifyInstall = () => {
  const result = run("hydra", ["projects"], { silent: true });
  if (result.status === 0) {
    ok("hydra CLI responds");
    return true;
  }
  return false;
};

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async () => {
  out("─────────────────────────────────────────────");
  out("  Hydra \u2014 one-click installer");
  out("─────────────────────────────────────────────");
  hr();

  const report = buildReport();
  printReport(report);

  if (FLAG_CHECK) {
    const allRequired = requiredKeys.every((key) => report[key].present);
    out(
      allRequired
        ? "All required prerequisites are present."
        : "Required prerequisites are missing.",
    );
    readline.close();
    process.exit(allRequired ? 0 : 1);
  }

  if (!(await ensureNode(report))) {
    readline.close();
    process.exit(1);
  }
  if (!(await ensurePnpm(report))) {
    readline.close();
    process.exit(1);
  }
  if (!(await ensureOpencode(report))) {
    readline.close();
    process.exit(1);
  }
  await ensureOptional(report);
  hr();

  if (!(await buildAndInstall())) {
    readline.close();
    process.exit(1);
  }

  out("Verifying the installation...");
  verifyInstall();
  hr();

  out("Installation complete. Next steps:");
  out("  1. cd into a project directory you want to orchestrate");
  out("  2. run `hydra` \u2014 the dashboard opens in your browser");
  out("  3. create a tentacle (Deck \u25b8 Create tentacle) or run `hydra tentacle create <name>`");
  out("  4. launch a terminal and start delegating todo items");
  hr();
  out("Full documentation: https://github.com/middleclassfiles/octopencode#readme");
  readline.close();
};

main().catch((error) => {
  console.error(`\nInstaller failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
