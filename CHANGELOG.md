# Changelog

All notable changes to `@kubit-ai/agent-plugin` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

## [0.0.3] - 2026-04-20

### Added

- `/kubit-blame` skill: downstream code-correlation workflow that maps
  trace identifiers to `file:line` locations and ranks recent commits
  by proximity, coverage, and diff surface.
- `kubit-blame-mapper` subagent: grep-first trace-to-code mapper that
  returns candidates with `confirmed` / `ambiguous` / `unresolved`
  status and never silently disambiguates.
- `kubit-blame-correlator` subagent: runs `git log` over confirmed
  locations, ranks suspects, and produces semantic diff summaries.
- Framework adapters at `skills/blame/references/frameworks/`:
  LangSmith, OpenAI Agents SDK, OpenTelemetry GenAI, Langfuse,
  OpenLLMetry, OpenInference, and Logfire, plus a contributor guide.

### Changed

- `/kubit-report` and `/kubit-inspect` now suggest `/kubit-blame` as a
  next step when regressions or failures surface.
- `/kubit-help` and `README.md` list `/kubit-blame` in the skill table.
- `bin/install.js`: agent installation is driven by a `SHIPPED_AGENTS`
  allowlist; skill installation now ships sibling files (e.g.
  `references/`) alongside `SKILL.md`; the runtime prompt always runs
  (no more `--claude` / `--cursor` / `--all` flags); adapter paths
  resolve through a `{{KUBIT_CONFIG_DIR}}` template marker so
  `--local` and custom config dirs work correctly.

## [0.0.2] - 2026-04-17

### Changed

- Trimmed `README.md` to public-facing content: removed local development, repo layout, and maintainer release sections; shortened the MCP section.

## [0.0.1] - 2026-04-17

Initial release.

### Added

- `npx @kubit-ai/agent-plugin` installer for Claude Code and Cursor, with `--global` / `--local` scope and a scratch `--config-dir` override.
- Skills: `connect`, `help`, `inspect`, `report`, `update`.
- `kubit-analyst` subagent for pandas-based CSV analysis.
- Bundled `.mcp.json` that wires the Kubit MCP server (`https://agent-int.kubit.ai/mcp`) via OAuth.
- On-disk `VERSION` stamp at `<config>/kubit/VERSION` so `/kubit-update` can detect the installed version.
