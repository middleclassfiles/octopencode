# Filesystem Layout

Hydra splits files by ownership. Agent-facing project context stays in the workspace. Runtime-owned state stays in the per-project global state directory.

## Project-local files

`.hydra/` is created in the workspace.

Main paths:

- `.hydra/project.json`
- `.hydra/tentacles/`
- `.hydra/worktrees/`

`project.json` holds the stable project ID used to find global state. The tentacles folder is intended for agent-readable markdown. Worktrees are generated execution checkouts and should not be treated as context storage.

Tentacle example:

```text
.hydra/
  tentacles/
    api-backend/
      CONTEXT.md
      todo.md
      routes.md
```

`CONTEXT.md` may end with a managed `Suggested Skills` block when the operator or planner attaches opencode skills to that tentacle.

Deck also writes UI metadata for tentacles, but not into these markdown files. Color, status, appearance, paths, and tags are stored in global deck state.

Project-local opencode skills, when present, live under:

```text
.opencode/
  skills/
    some-skill/
      SKILL.md
```

## Global state

Per-project runtime state is stored under:

```text
~/.hydra/projects/<project-id>/state/
```

Notable files:

- `tentacles.json`
- `deck.json`
- `transcripts/<sessionId>.jsonl`
- `opencode-usage-snapshot.json`
- `monitor-config.json`
- `monitor-cache.json`
- `code-intel-events.jsonl`

`tentacles.json` is the terminal registry despite the historical name. It stores terminal records, lifecycle state, UI state, parent-child links, workspace mode, worktree IDs, and display names.

`deck.json` stores Deck presentation metadata that is not part of the agent-facing tentacle files.

`transcripts/*.jsonl` stores conversation transcript events separately from PTY scrollback. Scrollback is in memory and bounded; transcripts are persisted. Stored opencode conversations are exported as `.opencode-turns.json` files in the same transcripts directory.

## Opencode bridge

Hydra installs its bridge plugin per workspace so opencode can report agent lifecycle events:

```text
.opencode/
  plugin/
    hydra-events.js
```

opencode auto-loads `*.js` files from `.opencode/plugin/`, and the bridge plugin calls back into the local API with session, prompt, tool, and idle events.

## Prompt storage

- core prompts are synced from `prompts/`
- synced copies live in `.hydra/prompts/core/`
- user prompts live in `.hydra/prompts/`

## Practical rule

If something is agent-facing context, keep it in the tentacle folder.

If something is runtime-owned state, expect it under the global project state directory.

If something is an isolated execution checkout, expect it under `.hydra/worktrees/` and treat its branch lifecycle as part of the terminal that created it.
