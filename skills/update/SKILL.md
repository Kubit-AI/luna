---
name: update
description: Use this skill when the user wants to check for or install updates to the Kubit agent plugin.
---

# /kubit-update

## Overview

Checks npm for a newer version of `@kubit-ai/agent-plugin`, shows what changed,
asks the user to confirm, and then re-runs the installer to apply the update.
No session required — this skill works without `/kubit-connect`.

## When to use

- The user asks whether there's a newer version of Kubit.
- The user asks to upgrade, update, or refresh the plugin.
- Another Kubit skill reports a capability that only exists in a newer version
  (e.g. "this requires @kubit-ai/agent-plugin 0.3+").

## Steps

### 1. Resolve install context

The three values below are substituted by `bin/install.js` at install time.

```bash
RUNTIME="{{KUBIT_RUNTIME}}"
CONFIG_DIR="{{KUBIT_CONFIG_DIR}}"
SCOPE="{{KUBIT_SCOPE}}"
```

### 2. Read the installed version

```bash
VERSION_FILE="$CONFIG_DIR/kubit/VERSION"
if [ -f "$VERSION_FILE" ]; then
  INSTALLED="$(cat "$VERSION_FILE")"
else
  INSTALLED="0.0.0"
fi
echo "installed: $INSTALLED"
```

### 3. Query the latest version on npm

```bash
LATEST="$(npm view @kubit-ai/agent-plugin version 2>/dev/null)"
if [ -z "$LATEST" ]; then
  echo "ERROR: could not reach npm"
  exit 1
fi
echo "latest: $LATEST"
```

If the query fails, tell the user npm is unreachable (likely offline or a
registry outage) and stop. Do not touch any files.

### 4. Compare versions and branch

```bash
if [ "$INSTALLED" = "$LATEST" ]; then
  echo "ALREADY_LATEST"
elif [ "$(printf '%s\n%s\n' "$INSTALLED" "$LATEST" | sort -V | tail -1)" = "$INSTALLED" ]; then
  echo "AHEAD_OF_LATEST"
else
  echo "UPDATE_AVAILABLE"
fi
```

- `ALREADY_LATEST` → tell the user they're on the current version and stop.
- `AHEAD_OF_LATEST` → warn that this looks like a dev install and stop. Do not
  downgrade.
- `UPDATE_AVAILABLE` → continue to step 5.

### 5. Fetch the new changelog section

```bash
TMP="$(mktemp -d /tmp/kubit-update-XXXXXX)"
cd "$TMP"
TGZ="$(npm pack @kubit-ai/agent-plugin@latest 2>/dev/null | tail -n 1)"
tar -xzf "$TGZ"
awk -v installed="$INSTALLED" '
  /^## \[[0-9]/ {
    if ($0 ~ "\\[" installed "\\]") exit
    p = 1
  }
  p { print }
' package/CHANGELOG.md
cd - >/dev/null
rm -rf "$TMP"
```

`awk` prints every changelog entry from the first `## [X.Y.Z]` header until it
hits the installed version's header. That's exactly the slice the user hasn't
seen yet.

### 6. Show the update preview

Present to the user, formatted clearly:

- Current version → new version.
- The changelog slice from step 5.
- **Clean-install warning** — list the exact paths that will be wiped and
  re-extracted:
  - `$CONFIG_DIR/skills/kubit-<each-shipped-skill>/` (one line per shipped skill)
  - `$CONFIG_DIR/agents/kubit-analyst.md`
  - `$CONFIG_DIR/kubit/` (metadata dir)
- Reassurance: user-added siblings under `$CONFIG_DIR/skills/` are preserved.
  User edits to shipped skills will be overwritten — suggest the user copy
  those edits out before continuing.

### 7. Confirm with the user

Use `AskUserQuestion` with two options: "Yes, update now" and "No, cancel."
Do not proceed without explicit confirmation. Wiping shipped files is
destructive.

### 8. Run the installer

```bash
case "$RUNTIME" in
  claude) CHOICE=1 ;;
  cursor) CHOICE=2 ;;
  *) echo "ERROR: unknown runtime '$RUNTIME'"; exit 1 ;;
esac
printf '%s\n' "$CHOICE" | npx -y @kubit-ai/agent-plugin@latest --"$SCOPE" --yes
```

The installer prompts interactively for the runtime (Claude Code / Cursor /
Both); piping the numeric choice answers that prompt non-interactively. `--yes`
skips the location prompt. The installer then overwrites the managed files,
writes the new VERSION, and exits.

### 9. Verify and report

```bash
NEW_VERSION="$(cat "$CONFIG_DIR/kubit/VERSION")"
echo "VERSION file now reports: $NEW_VERSION"
```

Confirm `$NEW_VERSION = $LATEST`. If they don't match, tell the user the
installer appears to have failed and point them to the npm logs.

On success, tell the user:

> Updated @kubit-ai/agent-plugin from `<INSTALLED>` to `<NEW_VERSION>`. Restart <Claude Code | Cursor> to pick up the new skills.

(Use the right runtime name based on `$RUNTIME`.)

## Rules

- Never skip the confirmation step (step 7). Clean install is destructive.
- Never run the installer if step 3 failed — offline means you cannot know
  what will actually install.
- Never "merge" or "patch" in place — always run the full installer. The
  installer's clean-install semantics are the contract.

## Gotchas

- **Users who edited shipped skills** lose their edits on update. v1 does not
  back them up. If the user mentions custom changes, pause before step 8 and
  suggest they copy the files out first.
- **Pre-release users** (installed via `@next` tag) — `npm view … version`
  returns the `latest` tag's version, so this skill may suggest "downgrading"
  them from a `next` build. The `AHEAD_OF_LATEST` branch catches this and
  stops. Users on `next` should re-run `npx @kubit-ai/agent-plugin@next` manually.
- **`sort -V`** handles proper semver but not all pre-release suffix orderings.
  For `-rc.N` and `-beta.N` suffixes, trust the `AHEAD_OF_LATEST` branch and
  advise manual reinstall.
