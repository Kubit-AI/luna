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

`bin/install.js` has a `SHIPPED_SKILLS` allowlist that controls which source folders under `skills/` actually get installed. Source dirs are kubit-prefixed and the prefix is the source of truth — install.js copies them as-is (no rename). Currently ships: `kubit-blame`, `kubit-connect`, `kubit-help`, `kubit-inspect`, `kubit-integrate`, `kubit-report`, `kubit-update`. Source folders not on the allowlist (e.g. `kubit-dataset`, `kubit-workflows`) stay in the repo for future iteration but are not installed into Claude Code or Cursor.

### Why each unshipped skill is on hold

- **`dataset`** — scope not yet firm. Re-evaluate once the MCP's dataset endpoints stabilize.
- **`workflows`** — its value is chaining `blame` + `dataset` + `inspect` + `report`. Ship alongside `dataset`, not before.

When shipping a new skill, add it to `SHIPPED_SKILLS` and also update the skill table in `README.md` and the listing in `skills/help/SKILL.md` so they stay in sync.

`bin/install.js` substitutes four template markers in every skill body at install time: `{{KUBIT_RUNTIME}}`, `{{KUBIT_CONFIG_DIR}}`, `{{KUBIT_SCOPE}}`, and `{{KUBIT_EXPORT_ENDPOINT}}`. The pass is a no-op on skills that don't reference these markers.

## Versioning

`package.json#version` is authoritative. `bin/install.js` reads it at install time to stamp `<config>/kubit/VERSION`. `package.json#files` controls what ships on npm. Bump `version` in `package.json` before publishing; no sync step.

## Slash-command spelling

Skills are installed at `~/.claude/skills/kubit-<name>/` (or `~/.cursor/skills/kubit-<name>/`) and invoked by the dash-joined directory name: `/kubit-connect`, `/kubit-inspect`, …. Source-tree skill bodies use the same dash form so what you read matches what users type.

## Cursor caveats

- Skills install to `~/.cursor/skills/kubit-<name>/SKILL.md` and are invoked with `/kubit-<name>`, same as the Claude Code npx path.
- The `kubit-analyst` subagent installs to `~/.cursor/agents/kubit-analyst.md`. Cursor subagents accept only `{name, description, model?, readonly?, is_background?}` in frontmatter, so the installer strips Claude-specific `tools:` and `model: sonnet` at install time (the subagent inherits the parent's model and tool access).

Keep these limits in mind when editing skill copy so the instructions still work under Cursor.

## MCP

Kubit MCP server is wired via OAuth (browser sign-in on first use); skills can assume it's configured. Dev (`.mcp.json` at repo root → `agent-int.kubit.ai/mcp`) is used only for project-scope sessions inside this repo and does **not** ship. Published installs get the URL constructed by `bin/install.js#mcpMerge()` from `FLAVOR.mcpUrl`. To change a non-prod URL edit the matching key in `scripts/non-prod-flavors.js`; for prod edit `PROD_FLAVOR` in `bin/install.js`. Never re-add `.mcp.json` to `package.json#files`.

## Publish hygiene

End-user tarballs must not leak internal infrastructure. Rules:

- **One source of prod URLs.** Only `bin/install.js#PROD_FLAVOR` holds shipped endpoints. Reference via `FLAVOR.exportEndpoint` / `FLAVOR.mcpUrl`; never hardcode elsewhere.
- **Non-prod URLs are never in shipped files.** All non-prod flavors live in `scripts/non-prod-flavors.js` as a map keyed by flavor name. `resolveFlavor()` `require`s that file (present in source, absent in the tarball) and looks up `KUBIT_FLAVOR` (default `int`); the map's keys are the allowlist, so adding a new flavor is one new key. Source tree picks the chosen flavor; tarball falls back to `PROD_FLAVOR`. `KUBIT_EXPORT_ENDPOINT` still overrides any of them.
- **Allowlist, not denylist.** `package.json#files` is authoritative; `.npmignore` is belt-and-braces. Keep out: internal hostnames (`*-dev.*`, `*-int.*`, `*-stg.*`), dev tooling (`scripts/`, `test/`, `docs/`, `DEVELOPMENT.md`, `CLAUDE.md`), editor state (`.claude/`, `.cursor/`, `.idea/`), and the source-tree `.mcp.json`.
- **CHANGELOG is shipped, public, and short.** One or two sentences per bullet, answering "what changed for me?" — never the implementation. Ban: URLs of any environment (prod URLs live only in `bin/install.js#PROD_FLAVOR`; reference them as "the default endpoint" in prose), internal hostnames, internal env-var names (`KUBIT_FLAVOR` and similar), internal package/module names, internal release status (`in dogfood`, `not yet on ship allowlist`), refactor metrics (`N-item list consolidated`, `updated in lockstep`), internal vocabulary (`env-only tier`, ticket IDs). User-facing env vars and CLI invocations are fine when users need them to act on the change. Skip entries for changes invisible to users (refactors, infra moves, internal renames). Never rewrite released history; redact only the minimum.
- **Audit before publish.** `npm pack && tar xzf *.tgz -C /tmp/kpack && grep -rniE 'otel-(dev|int|stg)\.kubit|agent-(int|stg)\.kubit|dogfood|in lockstep|env-only' /tmp/kpack/package/` — expect zero matches.

## Commit Convention

- Keep commit messages short and focused. Prefer a single-line subject
  under ~70 characters that names what changed; skip the body unless
  the diff truly needs context the subject can't carry.
- Do **not** add `Co-Authored-By` or any AI/Claude contribution
  trailers to commit messages.
