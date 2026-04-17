# CLAUDE.md

Guidance for Claude Code when working in this repo. End-user install, usage, and release docs live in [`README.md`](./README.md) — this file focuses on what Claude needs to know to edit the repo without breaking things.

## Project Overview

This repo is the `@kubit/agent-plugin` npm package — an agent plugin that ships `/kubit-*` skills for Kubit's LLM-ops platform (inspect traces, build analytics reports). It targets **Claude Code and Cursor**, installed via `npx @kubit/agent-plugin`.

## Working style

- **Think first.** State assumptions explicitly. If multiple interpretations exist, surface them — don't pick silently. If something is unclear, stop and ask.
- **Minimum change.** No speculative abstractions, flags, or error-handling for scenarios that can't happen. If it could be half the size, rewrite it.
- **Surgical edits.** Every changed line traces to the request. Don't "improve" adjacent code, comments, or formatting. Match existing style even if you'd do it differently.
- **Verify before done.** Name the check for each change and run it — e.g. cross-read `README.md` and `skills/help/SKILL.md` after a skill rename; walk through `bin/install.js` for both `--claude` and `--cursor` paths after touching install logic.

## Repository Layout

```
luna/
├── .mcp.json                # bundles the Kubit MCP server (OAuth)
├── bin/install.js           # npx installer for Claude Code + Cursor
├── skills/<name>/SKILL.md   # one dir per skill
├── agents/kubit-analyst.md  # subagent installed for Claude Code and Cursor
├── package.json             # npm publish manifest — source of truth for version
├── CHANGELOG.md             # Keep-a-Changelog release notes (shipped in the tarball)
├── VERSIONING.md            # semver + dist-tag policy
└── README.md                # end-user docs
```

## Skills

Each skill is `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`) defining the interactive process.

`bin/install.js` has a `SHIPPED_SKILLS` allowlist that controls which source folders under `skills/` actually get installed. Currently ships: `connect`, `help`, `inspect`, `report`, `update`. Source folders not on the allowlist (e.g. `blame`, `dataset`, `workflows`, `integrate`) stay in the repo for future iteration but are not installed into Claude Code or Cursor.

### Why each unshipped skill is on hold

- **`blame`, `dataset`** — scope not yet firm. Re-evaluate once the MCP's blame and dataset endpoints stabilize.
- **`workflows`** — its value is chaining `blame` + `dataset` + `inspect` + `report`. Ship alongside `blame` and `dataset`, not before.
- **`integrate`** — placeholder folder added on `master` for future work. No body yet.

When shipping a new skill, add it to `SHIPPED_SKILLS` and also update the skill table in `README.md` and the listing in `skills/help/SKILL.md` so they stay in sync.

The `update` skill uses three template markers — `{{KUBIT_RUNTIME}}`, `{{KUBIT_CONFIG_DIR}}`, `{{KUBIT_SCOPE}}` — that `bin/install.js` substitutes at install time. The substitution pass runs on every skill body but is a no-op on skills that don't use these markers.

## Versioning

`package.json#version` is authoritative. `bin/install.js` reads it at install time to stamp `<config>/kubit/VERSION`. `package.json#files` controls what ships on npm. Bump `version` in `package.json` before publishing; no sync step.

## Slash-command spelling

Skills are installed at `~/.claude/skills/kubit-<name>/` (or `~/.cursor/skills/kubit-<name>/`) and invoked by the dash-joined directory name: `/kubit-connect`, `/kubit-inspect`, …. Source-tree skill bodies use the same dash form so what you read matches what users type.

## Cursor caveats

- Skills install to `~/.cursor/skills/kubit-<name>/SKILL.md` and are invoked with `/kubit-<name>`, same as the Claude Code npx path.
- The `kubit-analyst` subagent installs to `~/.cursor/agents/kubit-analyst.md`. Cursor subagents accept only `{name, description, model?, readonly?, is_background?}` in frontmatter, so the installer strips Claude-specific `tools:` and `model: sonnet` at install time (the subagent inherits the parent's model and tool access).

Keep these limits in mind when editing skill copy so the instructions still work under Cursor.

## MCP

`.mcp.json` auto-wires the Kubit MCP server at `https://agent-int.kubit.ai/mcp` (standard OAuth — browser sign-in on first use). Skills calling MCP tools can assume it's configured.

## Commit Convention

Do **not** add `Co-Authored-By` or any AI/Claude contribution trailers to commit messages.
