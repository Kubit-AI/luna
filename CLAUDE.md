# CLAUDE.md

Guidance for Claude Code when working in this repo. End-user install, usage, and release docs live in [`README.md`](./README.md) — this file focuses on what Claude needs to know to edit the repo without breaking things.

## Project Overview

This repo is the `@kubit-ai/agent-plugin` npm package — an agent plugin that ships `/kubit-*` skills for Kubit's LLM-ops platform (inspect traces, build analytics reports). It targets **Claude Code and Cursor**, installed via `npx @kubit-ai/agent-plugin`.

## Working style

- **Think first.** State assumptions explicitly. If multiple interpretations exist, surface them — don't pick silently. If something is unclear, stop and ask.
- **Minimum change.** No speculative abstractions, flags, or error-handling for scenarios that can't happen. If it could be half the size, rewrite it.
- **Surgical edits.** Every changed line traces to the request. Don't "improve" adjacent code, comments, or formatting. Match existing style even if you'd do it differently.
- **Verify before done.** Name the check for each change and run it — e.g. cross-read `README.md` and `skills/help/SKILL.md` after a skill rename; walk through `bin/install.js` for both the Claude Code and Cursor paths after touching install logic.

## Repository Layout

```
luna/
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

`bin/install.js` has a `SHIPPED_SKILLS` allowlist that controls which source folders under `skills/` actually get installed. Source dirs are kubit-prefixed and the prefix is the source of truth — install.js copies them as-is (no rename). Currently ships: `kubit-blame`, `kubit-connect`, `kubit-help`, `kubit-inspect`, `kubit-integrate`, `kubit-report`, `kubit-update`.

When shipping a new skill, add it to `SHIPPED_SKILLS` and also update the skill table in `README.md` and the listing in `skills/help/SKILL.md` so they stay in sync.

`bin/install.js` substitutes four template markers in every skill body at install time: `{{KUBIT_RUNTIME}}`, `{{KUBIT_CONFIG_DIR}}`, `{{KUBIT_SCOPE}}`, and `{{KUBIT_MCP_AUTH}}`. The first three are runtime/scope values; `{{KUBIT_MCP_AUTH}}` expands to the shared MCP auth-failure block (`KUBIT_MCP_AUTH` constant in `bin/install.js`) that connect, inspect, and report all inline — edit it in one place since skills can't reference each other's bodies at runtime. The pass is a no-op on skills that don't reference these markers.

## Versioning

`package.json#version` is authoritative. `bin/install.js` reads it at install time to stamp `<config>/kubit/VERSION`. `package.json#files` controls what ships on npm. Bump `version` in `package.json` before publishing; no sync step.

## Slash-command spelling

Skills are installed at `~/.claude/skills/kubit-<name>/` (or `~/.cursor/skills/kubit-<name>/`) and invoked by the dash-joined directory name: `/kubit-connect`, `/kubit-inspect`, …. Source-tree skill bodies use the same dash form so what you read matches what users type.

## Cursor caveats

- Skills install to `~/.cursor/skills/kubit-<name>/SKILL.md` and are invoked with `/kubit-<name>`, same as the Claude Code npx path.
- The `kubit-analyst` subagent installs to `~/.cursor/agents/kubit-analyst.md`. Cursor subagents accept only `{name, description, model?, readonly?, is_background?}` in frontmatter, so the installer strips Claude-specific `tools:` and `model: sonnet` at install time (the subagent inherits the parent's model and tool access).

Keep these limits in mind when editing skill copy so the instructions still work under Cursor.

## MCP

Kubit MCP server is wired via OAuth (browser sign-in on first use); skills can assume it's configured. The MCP URL is hardcoded in `bin/install.js#KUBIT_MCP_URL` and stamped into the user's MCP config by `mcpMerge()`. The `.mcp.json` at repo root is gitignored — devs working against a non-prod MCP keep their own copy locally.

## Publish hygiene

End-user tarballs must not leak internal infrastructure. Rules:

- **Prod endpoints are hardcoded.** The MCP URL lives in `bin/install.js#KUBIT_MCP_URL`. The OTel ingest endpoint default lives inside `@kubit-ai/otel` / `kubit-otel`; users who need a non-default endpoint set `KUBIT_OTEL_ENDPOINT` locally. Skill bodies do not reference any endpoint string literal.
- **Allowlist, not denylist.** `package.json#files` is authoritative; `.npmignore` is belt-and-braces. Keep out: dev tooling (`test/`, `docs/`, `CLAUDE.md`), editor state (`.claude/`, `.cursor/`, `.idea/`), and any local `.mcp.json`.
- **CHANGELOG is shipped, public, and short.** One or two sentences per bullet, answering "what changed for me?" — never the implementation. Skip internal-only details: non-prod URLs, internal package or release-status terminology, ticket IDs, refactor metrics. User-facing env vars and CLI invocations are fine when users need them to act on the change. Skip entries for changes invisible to users (refactors, infra moves, internal renames). Never rewrite released history; redact only the minimum.
- **Audit before publish.** Run `npm pack && tar xzf *.tgz -C /tmp/kpack` and grep the unpacked tree for any non-production endpoint, internal hostname, or internal vocabulary that may have slipped into a framework adapter `.md`. Expect zero matches.

## Commit Convention

- Keep commit messages short and focused. Prefer a single-line subject
  under ~70 characters that names what changed; skip the body unless
  the diff truly needs context the subject can't carry.
- Do **not** add `Co-Authored-By` or any AI/Claude contribution
  trailers to commit messages.
