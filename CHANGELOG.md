# Changelog

All notable changes to `@kubit-ai/agent-plugin` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- `/kubit-integrate` now emits bootstrap files that wire the first-party
  Kubit SDKs (`kubit-otel` on PyPI, `@kubit-ai/otel` on npm) instead of
  raw OTLP/HTTP exporter code. Ingestion moves from OTLP POSTs to the
  SDK's token-exchange + Kinesis transport. All 8 framework adapters
  (braintrust, langfuse, langsmith, logfire, openai-agents,
  openinference, openllmetry, otel-genai) were updated in lockstep;
  Langfuse's `env-only` tier was dropped in favor of the shared
  bootstrap-file pattern.
- `/kubit-integrate` renames the env vars it writes to the user's
  `.env`: `KUBIT_OTEL_API_KEY` → `KUBIT_EXPORT_API_KEY` and
  `KUBIT_OTEL_ENDPOINT` → `KUBIT_EXPORT_ENDPOINT`. The endpoint value is
  now a full token-endpoint URL (e.g.
  `https://kubit-ingest-dev.kubit.ai/token`), not an OTLP base with
  `/v1/traces` appended.
- `bin/install.js` template marker renamed `{{KUBIT_OTEL_ENDPOINT}}` →
  `{{KUBIT_EXPORT_ENDPOINT}}`. Install-time override env var renamed
  accordingly; default stamped value updated to the SDK's token
  endpoint shape.
- `/kubit-integrate` (still in dogfood, not yet on the ship allowlist)
  becomes the single turn-on-Kubit flow: ensures a Kubit session (via
  `/kubit-connect` when needed), creates a fresh workspace with an
  interactive name + timezone prompt, mints the ingestion key via
  `workspace_mint_key`, and writes `KUBIT_EXPORT_API_KEY` to the repo's
  `.env` (skipping the write and printing `export …` instead when
  `.env` is not gitignored) before emitting the SDK bootstrap file.
- `/kubit-connect` no longer creates workspaces. The `create-workspace`
  action, Example 3, When-to-Use bullet, and supporting rule were
  removed; the skill now points users at `/kubit-integrate` for
  onboarding.
- `/kubit-help` drops the `create workspace` example from the
  `/kubit-connect` description to match the shrunk scope.
- `/kubit-integrate` simplifications: dropped the optional context7
  refresh step, consolidated the 17-item error-handling list into 6
  phase-grouped buckets, and replaced the fixed `.env` write target
  with a detection heuristic that picks `.env.local` vs `.env` based
  on existing files and framework manifests (still gitignore-gated,
  same print-export fallback).

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
