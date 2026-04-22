# Development

Internal notes for maintainers. Not shipped with the npm package (see
[`package.json#files`](./package.json) — the `files` allowlist excludes
anything not explicitly listed; `.npmignore` adds belt-and-braces
exclusions on top).

## Build flavors

`bin/install.js` resolves one of two endpoint pairs at runtime:

| Flavor | Ingest token endpoint                     | MCP server URL                   |
| :----- | :---------------------------------------- | :------------------------------- |
| `dev`  | `https://kubit-ingest-dev.kubit.ai/token` | `https://agent-int.kubit.ai/mcp` |
| `prod` | `https://kubit-ingest.kubit.ai/token`     | `https://agent.kubit.ai/mcp`     |

Only the `prod` pair is hardcoded in `bin/install.js` (as `PROD_FLAVOR`).
The `dev` pair lives in `scripts/dev-flavor.js`, which is **not** in
`package.json#files` and therefore never ships on npm. `resolveFlavor()`
in `install.js` does a `try { require('../scripts/dev-flavor.js') }`: if
it resolves (source tree), the installer runs with dev endpoints; if it
throws (published tarball), the installer falls back to `PROD_FLAVOR`.

This means:

- End users running `npx @kubit-ai/agent-plugin` always hit prod.
- Anyone unpacking the tarball to inspect `bin/install.js` sees only the
  prod URLs. Internal dev hostnames are not published.
- Local dev iteration continues to hit dev without any extra setup — the
  source tree carries the dev-flavor module.

Override for either flavor:

```bash
KUBIT_EXPORT_ENDPOINT=https://custom-host/token npx @kubit-ai/agent-plugin
```

The env var wins over the resolved export endpoint. The MCP URL has no
env override — edit `scripts/dev-flavor.js` (for local testing) or
`PROD_FLAVOR` in `bin/install.js` if you need a different MCP host.

## Local installation (dev)

From the repo checkout:

```bash
# Install into a scratch config dir so your real ~/.claude isn't touched:
node bin/install.js -c /tmp/kubit-scratch -y

# Or install globally (user-wide ~/.claude) — runtime prompt still fires:
node bin/install.js
```

Because `scripts/dev-flavor.js` is present, `resolveFlavor()` returns dev
endpoints. Expect `kubit-ingest-dev.kubit.ai` in substituted skill
snippets and `agent-int.kubit.ai/mcp` in the merged MCP config.

`-l` / `--local` writes into `./.claude` (and/or `./.cursor`) under cwd —
useful when iterating on a specific repo, but incompatible with `-c`.

## Production build (publish)

No prepack/postpack is needed — the flavor mechanism is entirely
file-presence-based. `npm publish` just packs what
[`package.json#files`](./package.json) lists.

Verify the prod path without publishing:

```bash
npm pack                                        # emits kubit-ai-agent-plugin-X.Y.Z.tgz
tar tzf kubit-ai-agent-plugin-*.tgz | grep -E 'scripts|\.mcp\.json'   # expect: nothing
grep -E 'kubit-ingest-dev|agent-int' /tmp/kpack/package/bin/install.js  # expect: nothing

mkdir -p /tmp/kpack && tar xzf kubit-ai-agent-plugin-*.tgz -C /tmp/kpack
node /tmp/kpack/package/bin/install.js -c /tmp/kubit-prod -y
grep -r 'kubit-ingest.kubit.ai/token' /tmp/kubit-prod/skills          # prod host baked in
```

Dist-tags and pre-release suffixes are covered in
[`VERSIONING.md`](./VERSIONING.md).

## Tests

```bash
npm test
```

Covers marker substitution (`substituteKubitMarkers`, `copySkillSibling`)
and flavor resolution: `PROD_FLAVOR` shape, source-tree dev override,
fallback to prod when `scripts/dev-flavor.js` is absent.

## Files that must not ship

`package.json#files` is an allowlist, so anything not listed is excluded
by default. These paths are deliberately off the list so no internal
hostnames, dev overrides, or personal editor state leak onto npm:

- `DEVELOPMENT.md` (this file), `CLAUDE.md`
- `.mcp.json` (the source-tree copy — holds the dev MCP URL for
  project-scope Claude Code sessions inside this repo; not needed at
  install time because `mcpMerge()` constructs the entry from the
  resolved flavor)
- `scripts/` (including `scripts/dev-flavor.js`)
- `test/`, `docs/`, `.github/`
- `.claude/`, `.cursor/` — personal settings that occasionally land
  inside subdirs; also excluded via `.npmignore`

If you add a new top-level path that should ship, add it to
`package.json#files` and smoke-test with `npm pack && tar tzf *.tgz`.
