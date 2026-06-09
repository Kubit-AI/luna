# Versioning

`@kubit-ai/agent-plugin` follows [Semantic Versioning 2.0.0](https://semver.org/).

## Version rules

| Bump | Triggered by |
| :-- | :-- |
| **Patch** (0.0.1 → 0.0.2) | Bug fixes, documentation-only changes, non-behavioral skill wording tweaks |
| **Minor** (0.0.1 → 0.1.0) | New skill, new installer option, additive MCP tool, any backwards-compatible enhancement |
| **Major** (0.0.1 → 1.0.0) | Removing or renaming a skill, changing a CLI flag incompatibly, changing the `VERSION` file format, any change that breaks an existing install without manual intervention |

`package.json#version` is the source of truth. `bin/install.js` reads it at install time and stamps `<config>/kubit/VERSION` so the `/kubit-update` skill can detect the installed version.

## Dist-tags

Two npm dist-tags govern availability:

- **`latest`** — stable production builds. Default install target for `npx @kubit-ai/agent-plugin`.
- **`next`** — pre-release builds for early adopters. Opt-in via `npx @kubit-ai/agent-plugin@next`.

Publish with `npm publish --access public` (→ `latest`) or `npm publish --tag next --access public` (→ `next`).

## Pre-release suffixes

Follow these suffix conventions so maintainers and users can tell a release's maturity at a glance:

- **`-rc.N`** — release candidates for a minor version (e.g. `0.3.0-rc.1`). "Production-ready, but gathering confidence."
- **`-beta.N`** — pre-releases for a major version (e.g. `1.0.0-beta.1`). "Feature-complete but expect longer bake time."

Pre-releases always publish to the `next` tag. Promote to `latest` only after the suffix is removed and a stable `X.Y.Z` is cut.

## Breaking-change policy

Anything that requires an existing install to be manually touched — a renamed skill, a removed CLI flag, a changed on-disk layout — is a major bump. No exceptions. When in doubt, bump major and document the migration in the `CHANGELOG.md` entry.
