# Development

Internal notes for maintainers. Not shipped with the npm package (see
[`package.json#files`](./package.json) — the `files` allowlist excludes
anything not explicitly listed; `.npmignore` adds belt-and-braces
exclusions on top).

## Build flavors

`bin/install.js` resolves one of three endpoint pairs at runtime:

| Flavor | Selector                        | OTLP traces endpoint                                  | MCP server URL                   |
| :----- | :------------------------------ | :---------------------------------------------------- | :------------------------------- |
| `int`  | default (or `KUBIT_FLAVOR=int`) | `https://otel-dev.kubit.ai/v1/traces`                 | `https://agent-int.kubit.ai/mcp` |
| `stg`  | `KUBIT_FLAVOR=stg`              | `https://otel-dev.kubit.ai/v1/traces`                 | `https://agent-stg.kubit.ai/mcp` |
| `prod` | published tarball               | `https://otel.kubit.ai/v1/traces`                     | `https://agent.kubit.ai/mcp`     |

Only the `prod` pair is hardcoded in `bin/install.js` (as `PROD_FLAVOR`).
All non-prod flavors live in `scripts/non-prod-flavors.js` as a single
map keyed by flavor name. That file is not in `package.json#files`, so
it never ships on npm. `resolveFlavor()` in `install.js`:

1. Does `try { require('../scripts/non-prod-flavors.js') }`. If it
   throws (published tarball), returns `PROD_FLAVOR` immediately —
   `KUBIT_FLAVOR` is ignored in that environment.
2. In the source tree, looks up `KUBIT_FLAVOR` (default `int`) in the
   map. Unknown keys fail fast via `fatal()`. The map's keys *are* the
   allowlist — adding a new flavor is a one-line change.

This means:

- End users running `npx @kubit-ai/agent-plugin` always hit prod —
  `KUBIT_FLAVOR` set in a published install still falls back to prod
  because the non-prod map is absent.
- Anyone unpacking the tarball to inspect `bin/install.js` sees only the
  prod URLs. Internal hostnames (int, stg, …) are not published.
- Local dev iteration continues to hit `int` without any extra setup —
  the source tree carries `scripts/non-prod-flavors.js`.
- Local staging runs use `KUBIT_FLAVOR=stg` and require the staging
  URLs to be filled into the `stg` entry of `scripts/non-prod-flavors.js`
  first.

Adding a new non-prod flavor (`qa`, `pre`, …) is one new key in
`scripts/non-prod-flavors.js`; nothing else in `bin/install.js` needs to
change.

Override for any flavor:

```bash
KUBIT_OTEL_ENDPOINT=https://custom-host/v1/traces npx @kubit-ai/agent-plugin
```

The env var wins over the resolved export endpoint. The MCP URL has no
env override — edit the relevant entry in `scripts/non-prod-flavors.js`
(for local testing) or `PROD_FLAVOR` in `bin/install.js` if you need a
different MCP host.

## Local installation (dev)

From the repo checkout:

```bash
# Install into a scratch config dir so your real ~/.claude isn't touched:
node bin/install.js -c /tmp/kubit-scratch -y

# Or install globally (user-wide ~/.claude) — runtime prompt still fires:
node bin/install.js

# Run against staging (after filling in scripts/non-prod-flavors.js stg placeholders):
KUBIT_FLAVOR=stg node bin/install.js -c /tmp/kubit-stg -y
```

By default `KUBIT_FLAVOR=int`, so the `int` entry of
`scripts/non-prod-flavors.js` is used: `otel-dev.kubit.ai` in
substituted skill snippets and `agent-int.kubit.ai/mcp` in the merged
MCP config. With `KUBIT_FLAVOR=stg` the installer reads the `stg` entry
of the same file.

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
grep -rE 'otel-dev\.kubit|agent-(int|stg)' /tmp/kpack/package/  # expect: nothing

mkdir -p /tmp/kpack && tar xzf kubit-ai-agent-plugin-*.tgz -C /tmp/kpack
node /tmp/kpack/package/bin/install.js -c /tmp/kubit-prod -y
grep -r 'otel.kubit.ai/v1/traces' /tmp/kubit-prod/skills  # prod host baked in
```

Dist-tags and pre-release suffixes are covered in
[`VERSIONING.md`](./VERSIONING.md).

## Tests

```bash
npm test
```

Covers marker substitution (`substituteKubitMarkers`, `copySkillSibling`)
and flavor resolution: `PROD_FLAVOR` shape, source-tree int (default)
and stg overrides, fallback to prod when `scripts/non-prod-flavors.js`
is absent, and rejection of unknown `KUBIT_FLAVOR` values.

## Files that must not ship

`package.json#files` is an allowlist, so anything not listed is excluded
by default. These paths are deliberately off the list so no internal
hostnames, dev overrides, or personal editor state leak onto npm:

- `DEVELOPMENT.md` (this file), `CLAUDE.md`
- `.mcp.json` (the source-tree copy — holds the dev MCP URL for
  project-scope Claude Code sessions inside this repo; not needed at
  install time because `mcpMerge()` constructs the entry from the
  resolved flavor)
- `scripts/` (including `scripts/non-prod-flavors.js`)
- `test/`, `docs/`, `.github/`
- `.claude/`, `.cursor/` — personal settings that occasionally land
  inside subdirs; also excluded via `.npmignore`

If you add a new top-level path that should ship, add it to
`package.json#files` and smoke-test with `npm pack && tar tzf *.tgz`.
