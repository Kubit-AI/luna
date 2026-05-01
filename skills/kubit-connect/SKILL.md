---
name: kubit-connect
description: Use this skill when starting a Kubit workspace context or switching organization or workspace. To create a new workspace, use `/kubit-integrate`.
---

# /kubit-connect

## Overview

This skill pins the current Kubit org/workspace by calling `init` or
`switch` and capturing the returned `WSCTX` value (workspace context
token).

Two distinct things must be in place for Kubit MCP calls to work, and
this skill only owns the second:

1. **MCP authentication** — a one-time browser OAuth sign-in against
   the Kubit Agent MCP server. Driven by Claude Code's built-in
   `/mcp` command (or, in environments without it, by opening an auth
   URL the MCP surfaces). Until this completes, every Kubit MCP call
   — including `init` — fails with an auth error. See *Pre-flight:
   MCP authentication* below.
2. **Workspace context (`wsctx`)** — the `WSCTX` value returned by
   `init` and `switch`. Pass it on every subsequent Kubit MCP call. It
   is **not** an auth token; it only pins which org/workspace the
   calls operate against. If lost, just call `init` or `switch` again.

## When to Use

This skill should be invoked when:
- The user runs /kubit-connect for the first time
- The user wants to switch organization or workspace
- Another Kubit skill needs to be called and you don't have WSCTX on the context.

Workspace **creation** is not in scope here — route the user to
`/kubit-integrate`, which owns the interactive onboarding flow
(name, timezone, `workspace_create`, key mint, `.env` write).

## Inputs

- `organization` — Kubit organization name or id (optional, prompted if needed)
- `workspace` — workspace name or ID (optional, prompted if needed)
- `action` — `switch` (optional, inferred from wording)

## Pre-flight: check for updates

Run this once at the start of the first-time init flow (Example 1). Skip for
switch. This check does not require MCP auth.

```bash
CONFIG_DIR="{{KUBIT_CONFIG_DIR}}"
VERSION_FILE="$CONFIG_DIR/kubit/VERSION"
INSTALLED="$([ -f "$VERSION_FILE" ] && cat "$VERSION_FILE" || echo 0.0.0)"
LATEST="$(npm view @kubit-ai/agent-plugin version 2>/dev/null)"

if [ -n "$LATEST" ] \
  && [ "$INSTALLED" != "$LATEST" ] \
  && [ "$(printf '%s\n%s\n' "$INSTALLED" "$LATEST" | sort -V | tail -1)" = "$LATEST" ]; then
  echo "kubit $INSTALLED → $LATEST available — run /kubit-update to upgrade."
fi
```

Stay silent on every other branch (already latest, ahead of latest, npm unreachable).
Always continue regardless — this notice is informational only.

## Pre-flight: MCP authentication

Run on every entry to this skill, after the update check.

Attempt the `init` MCP tool. If it succeeds, MCP auth is already
established — capture the response and continue with the rest of the
flow (Example 1 or 2; for `switch`, you may instead call `switch`
directly and treat its auth error the same way).

If the call fails with an auth/unauthenticated error:

- **Claude Code:** ask the user to run `/mcp`, complete sign-in for
  the Kubit MCP server, then re-run `/kubit-connect`.
- **Cursor:** Cursor typically prompts the user inline to sign in to
  the MCP server on first use. Ask the user to confirm that prompt,
  then re-run `/kubit-connect`.
- **Fallback (any environment, or if the above doesn't fire):** if
  the MCP error response surfaces an auth URL, present it verbatim
  and ask the user to open it in their browser to complete sign-in.
  You may also `open <url>` via Bash to launch the browser — but
  still ask the user to confirm completion before retrying.

Do not retry `init` in a loop. Surface the instructions and exit 0;
the user re-runs `/kubit-connect` when sign-in is done.

## Rules

- Skip organization and workspace prompts if the user has only one of each
- Do not proceed to other skills if MCP authentication is not established — route the user to `/mcp` (Claude Code) or the auth URL paste flow (Cursor / fallback) per *Pre-flight: MCP authentication*.
- Do not proceed to other skills if you don't have a `WSCTX` obtained from `init` or `switch` — call one of them first.
- Do not persistently store the wsctx, keep it in context window and if it is lost - you can always request a new one using `init` or `switch`
- Refresh wsctx after 1 hour idle (not a security timeout — just re-pins the workspace)
- orgId and workspaceId must always be passed as a pair to `switch`
- Workspaces carrying the `[example: read-only, cannot mint api key]` tag in the `init` response are demo-only — surface the tag verbatim when listing them. If the user wants to instrument an app against one, route them to `/kubit-integrate` to switch to or create a real workspace.

## Examples

**Example 1 — First time access:**
Input: /kubit-connect

Run **Pre-flight: check for updates**, then **Pre-flight: MCP
authentication**. If `init` fails with an auth error, follow that
section's guidance and stop.

The successful `init` response gives you the current user,
organization, and workspace, plus the list of other available
organizations and workspaces.

**Example 2 — Switch org / workspace:**
Input: /kubit-connect switch workspace <workspace id>

Call the `switch` MCP call with the appropriate org and workspace IDs. The user may specify these with numeric id
or names.
Note that orgId and workspaceId come in pairs - you need to pass both when switching org/workspace.

**Example 3 — User asks to create a workspace:**
Input: /kubit-connect create workspace "workspace name"

Do not call `workspace_create` from this skill. Point the user at
`/kubit-integrate`, which runs the full onboarding flow (name,
timezone, workspace creation, API key mint, `.env` write, and the
tracing-exporter wiring). Exit 0 without touching the MCP.


## Gotchas

_to be added as we test._
