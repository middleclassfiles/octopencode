# Installation

Hydra is a local Node.js project with a local API and web UI.

## Requirements

- Node.js `22+`
- `opencode` installed and logged in for the supported workflow (see https://opencode.ai)
- `git` for worktree terminals
- `gh` for GitHub pull request features
- `curl` for the opencode plugin event callbacks

The current docs are opencode-first. Hydra is built around opencode as the default agent workflow.

## Local development install

```bash
pnpm install
pnpm dev
```

## Local global CLI install from a clone

```bash
pnpm install
pnpm build
npm install -g .
```

## npm registry install

Hydra is not published to the npm registry yet, so `npm install -g hydra` will fail with `404`.

## First run behavior

Running `hydra` inside a project directory will:

- create `.hydra/` if it does not exist
- add `.hydra` to `.gitignore` or create `.gitignore` when it is missing
- write a stable project ID to `.hydra/project.json`
- register the project under `~/.hydra/projects.json`
- move runtime state to `~/.hydra/projects/<project-id>/state/`
- choose an open local API port starting at `8787`
- open the browser unless `HYDRA_NO_OPEN=1`
- show a Deck setup card until the first tentacle is created

## Startup rules

- startup fails when the `opencode` binary is unavailable
- startup warns when optional integrations like `git`, `gh`, or `curl` are missing

## Next step

- [Quickstart](quickstart.md)
