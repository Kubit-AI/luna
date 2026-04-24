# Changelog

All notable changes to `@kubit-ai/agent-plugin` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Installer now points at the Kubit production endpoints by default.
  Running `npx @kubit-ai/agent-plugin` no longer requires any
  environment setup to reach Kubit. `KUBIT_EXPORT_ENDPOINT` remains
  available as an override for users targeting a non-default host.

### Changed

- `/kubit-integrate` now emits bootstrap files that wire the
  first-party Kubit SDKs (`kubit-otel` on PyPI, `@kubit-ai/otel` on
  npm) instead of raw OTLP/HTTP exporter code, using the SDK's
  token-exchange transport. Supported framework: Langfuse.
- `/kubit-integrate` and `/kubit-blame` now support Langfuse only;
  other frameworks exit with a friendly message. Adapters for
  Braintrust, LangSmith, Logfire, OpenAI Agents, OpenInference,
  OpenLLMetry, Vercel AI, and OpenTelemetry GenAI remain in the repo
  under `docs/frameworks/` and will be re-introduced incrementally.
- `/kubit-integrate` renames the env vars it writes to your `.env`:
  `KUBIT_OTEL_API_KEY` → `KUBIT_EXPORT_API_KEY` and
  `KUBIT_OTEL_ENDPOINT` → `KUBIT_EXPORT_ENDPOINT`. The endpoint value
  is now a token-endpoint URL from the Kubit ingest service, not an
  OTLP base with `/v1/traces` appended.
- `bin/install.js` template marker renamed `{{KUBIT_OTEL_ENDPOINT}}` →
  `{{KUBIT_EXPORT_ENDPOINT}}`, with the install-time override env var
  renamed to match.
- `/kubit-integrate` becomes the single turn-on-Kubit flow. It
  ensures a Kubit session (invoking `/kubit-connect` when needed),
  creates a fresh workspace with an interactive name + timezone
  prompt, mints an ingestion key, and writes `KUBIT_EXPORT_API_KEY`
  into the repo's `.env.local` or `.env` (picking automatically
  based on existing files and framework manifests, or printing an
  `export …` line instead when the target isn't gitignored) before
  emitting the SDK bootstrap file.
- `/kubit-connect` no longer creates workspaces. Use
  `/kubit-integrate` for onboarding; `/kubit-connect` is now focused
  on auth and org / workspace selection.
- `/kubit-help` drops the `create workspace` example from the
  `/kubit-connect` description to match the scope change above.

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
