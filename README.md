# Kubit agent plugin

An agent plugin that adds `/kubit-*` skills to Claude Code and Cursor for working with the Kubit LLM-ops platform — inspecting traces and building analytics reports.

## Skills

| Command            | Purpose                                                          |
| :----------------- | :--------------------------------------------------------------- |
| `/kubit-connect`   | Authenticate and select the current org / workspace              |
| `/kubit-help`      | List all kubit skills and how to use them                        |
| `/kubit-inspect`   | Inspect users, sessions, traces, and events                      |
| `/kubit-report`    | Find, run, or create analytics reports                           |
| `/kubit-update`    | Check npm for a new version and install it                       |

## Install

```bash
npx @kubit/agent-plugin --claude      # Claude Code
npx @kubit/agent-plugin --cursor      # Cursor
npx @kubit/agent-plugin --all         # both
```

Flags: `--global` (default, user-wide) or `--local` (current directory); `--uninstall` to remove; `--yes` for non-interactive.

After install, restart the runtime and try `/kubit-help`.

## Updating

Run `/kubit-update` inside the runtime. The skill reads the installed version from `<config>/kubit/VERSION`, checks npm for a newer release, shows the changelog slice you haven't seen yet, and re-runs the installer with your confirmation.

See [CHANGELOG.md](./CHANGELOG.md) for release notes and [VERSIONING.md](./VERSIONING.md) for semver + dist-tag policy.

## MCP server

The plugin bundles a `.mcp.json` that wires Claude Code to the Kubit MCP server at `https://agent-int.kubit.ai/mcp` automatically. The server uses standard OAuth — Claude Code will open a browser for you to sign in the first time you use any `/kubit-*` skill that needs the MCP.

## Local development

Iterate on a skill or the installer without publishing. All commands below run from the repo root; edit a `SKILL.md` or `bin/install.js`, then re-run the install command to pick up changes.

**Install to a scratch dir — safe, doesn't touch your real Claude config:**

```bash
node bin/install.js --claude --config-dir /tmp/kubit-scratch --yes
```

**Install to your real global Claude config (`~/.claude`):**

```bash
node bin/install.js --claude --yes
```

**Install locally into a scratch cwd (`./.claude/` or `./.cursor/` under cwd).** `--config-dir` only applies to Claude Code, so Cursor tests need to `cd` into a scratch dir first:

```bash
mkdir -p /tmp/kubit-cursor-scratch && cd /tmp/kubit-cursor-scratch
node "$OLDPWD"/bin/install.js --cursor --local --yes
```

> ⚠️ Do **not** run `--local` from the repo root — the installer's local-mode MCP path is `./.mcp.json`, which collides with the bundled source file. An uninstall would delete it. Always `cd` into a scratch dir first for local-mode testing.

**Undo any of the above:**

```bash
node bin/install.js --uninstall --claude --config-dir /tmp/kubit-scratch
node bin/install.js --uninstall --claude       # undo the global install
(cd /tmp/kubit-cursor-scratch && node "$OLDPWD"/bin/install.js --uninstall --cursor --local)
```

**Exercise the full npm path (pack + install from tarball) to catch `files`-whitelist bugs before publish:**

```bash
npm pack
npx ./kubit-agent-plugin-0.0.1.tgz --claude --config-dir /tmp/kubit-scratch --yes
```

**Inspect what got installed:**

```bash
cat /tmp/kubit-scratch/kubit/VERSION
ls  /tmp/kubit-scratch/skills/
cat /tmp/kubit-scratch/skills/kubit-update/SKILL.md   # verify {{KUBIT_*}} markers were substituted
```

**Equivalent via `npx .`** (resolves to the repo as a local package — same result, just a different invocation):

```bash
npx . --claude --config-dir /tmp/kubit-scratch --yes
```

## Layout

```
luna/
├── .mcp.json                # bundled kubit MCP server config
├── bin/
│   └── install.js           # npx installer for Claude Code + Cursor
├── package.json             # npm publishing manifest
├── CHANGELOG.md             # Keep-a-Changelog release notes (shipped in the tarball)
├── VERSIONING.md            # semver + dist-tag policy
├── skills/
│   ├── connect/SKILL.md
│   ├── help/SKILL.md
│   ├── inspect/SKILL.md
│   ├── report/SKILL.md
│   └── update/SKILL.md
└── agents/
    └── kubit-analyst.md     # sub-agent for CSV/pandas analysis
```

## Release (maintainers)

1. (One-time) Create the `@kubit` scope on npmjs.com and `npm login`.
2. Bump `version` in `package.json`.
3. Update `CHANGELOG.md` — move the `[Unreleased]` section under the new version header with today's date.
4. Commit and tag.
5. `npm publish --access public` (stable) or `npm publish --tag next --access public` (pre-release — see [VERSIONING.md](./VERSIONING.md)).

## License

Proprietary. See [LICENSE](./LICENSE).
