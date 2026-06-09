# Changelog

All notable changes to `@kubit-ai/agent-plugin` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.4] - 2026-05-26

### Changed

- When MCP sign-in is required, the skills now open the sign-in URL in
  your browser automatically, instead of asking you to click a link
  that can wrap across terminal lines. The URL is still printed so you
  can open it manually if your browser doesn't launch. This now also
  fires when an auth prompt appears mid-task in `/kubit-inspect` and
  `/kubit-report`, not just during `/kubit-connect`.

## [0.1.3] - 2026-05-11

### Changed

- `/kubit-integrate` now installs the Kubit OTel SDK
  (`@kubit-ai/otel` on Node, `kubit-otel` on Python) and wires it
  into your existing tracing setup. Built-in span filtering keeps
  HTTP/DB auto-instrumentation noise out of Kubit by default. Set
  `KUBIT_OTEL_ENDPOINT` to override the default ingest endpoint.
  Requires OpenTelemetry JS SDK v2 on Node — `/kubit-integrate`
  refuses to install when the project pins `^1.x`.

## [0.1.2] - 2026-05-08

### Changed

- `/kubit-integrate` now ships traces via the standard OpenTelemetry
  OTLP HTTP exporter instead of a Kubit-specific SDK — no extra
  Kubit packages to install. The env var the installer writes is
  now `KUBIT_API_KEY`.

## [0.1.1] - 2026-05-06

### Fixed

- Installer prompts now reflect the chosen action: running with `-u`
  asks "Which runtime(s) to uninstall?" and "Uninstall from global or
  local?", instead of always saying "install".

## [0.1.0] - 2026-04-22

### Changed

- `/kubit-integrate` is the turn-on-Kubit flow: it detects existing
  tracing on two axes — observability **sinks** (Langfuse, Braintrust)
  and LLM-side **sources** (Vercel AI SDK, OpenTelemetry GenAI,
  LangChain) — creates a Kubit workspace, mints an ingestion key,
  writes `KUBIT_EXPORT_API_KEY` to `.env.local` / `.env`, and emits a
  bootstrap that wires the first-party Kubit SDKs (`kubit-otel` on
  PyPI, `@kubit-ai/otel` on npm) via token-exchange transport. When a
  sink is detected Kubit joins its pipeline; when no sink is present
  Kubit becomes the sole sink for the detected sources. The installer
  defaults to Kubit production endpoints (`KUBIT_EXPORT_ENDPOINT`
  remains an override), and `/kubit-connect` is now scoped to auth
  and org / workspace selection.

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
- Bundled `.mcp.json` that wires the Kubit MCP server via OAuth.
- On-disk `VERSION` stamp at `<config>/kubit/VERSION` so `/kubit-update` can detect the installed version.
