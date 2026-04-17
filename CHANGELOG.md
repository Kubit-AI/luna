# Changelog

All notable changes to `@kubit-ai/agent-plugin` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

## [0.0.1] - 2026-04-17

Initial release.

### Added

- `npx @kubit-ai/agent-plugin` installer for Claude Code and Cursor, with `--global` / `--local` scope and a scratch `--config-dir` override.
- Skills: `connect`, `help`, `inspect`, `report`, `update`.
- `kubit-analyst` subagent for pandas-based CSV analysis.
- Bundled `.mcp.json` that wires the Kubit MCP server (`https://agent-int.kubit.ai/mcp`) via OAuth.
- On-disk `VERSION` stamp at `<config>/kubit/VERSION` so `/kubit-update` can detect the installed version.
