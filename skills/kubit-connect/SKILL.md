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
   the Kubit Agent MCP server, through Claude Code's `authenticate` tool
   for the Kubit server (with `/mcp` as the fallback). Until this completes,
   the Kubit tools are not available, or fail with an auth error. See *Pre-flight:
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

If the Kubit tools are not available (only `authenticate` is offered
for the Kubit server), sign in first as below. Otherwise attempt the
`init` MCP tool. If it succeeds, MCP auth is already established —
capture the response and continue with the rest of the flow (Example 1
or 2; for `switch`, you may instead call `switch` directly and treat its
auth error the same way).

{{KUBIT_MCP_AUTH}}

## Rules
- Use the `<memory-context>` and `<lumos-instructions>` blocks and the Lumos skills that `init` and `switch` return in every Kubit call: workspace instructions, then the current request, then personal instructions, then memory; the current schema wins over all of them. When the user corrects an event, field, metric or cohort, or states a standing preference for Kubit results, save it with `memory(action="update", target="user", operations=[{op: "add", text: "…"}], wsctx)` before finishing; change workspace memory only when they ask for it.
- When a Kubit call fails and stops the flow (not an auth error), offer a support ticket: call `help` with `requestType: BUG` and no `draftId` to preview it, ask as the preview says, and file only on the user's yes.

- When a Kubit result ends with "Lumos context changed since it was loaded", call `switch` once with the same org and workspace to reload it, and use the wsctx it returns from then on. Do not call it again for the same notice.
- Skip organization and workspace prompts if the user has only one of each
- Do not proceed to other skills if MCP authentication is not established — sign in with Claude Code's `authenticate` tool for the Kubit server (falling back to `/mcp` on Claude Code, or Cursor Settings → MCP) per *Pre-flight: MCP authentication*.
- Do not proceed to other skills if you don't have a `WSCTX` obtained from `init` or `switch` — call one of them first.
- Do not persistently store the wsctx, keep it in context window and if it is lost - request a new one with `switch` for the workspace already in use (or `init` when none is known): `init` may land on a different workspace, since it reads preferences shared across clients.
- Refresh wsctx after 1 hour idle (not a security timeout — just re-pins the workspace)
- orgId and workspaceId must always be passed as a pair to `switch`
- Workspaces carrying the `[example: read-only, cannot mint api key]` or `[modeled: read-only, no ingestion / api key]` tag in the `init` response cannot take an app's traces — surface the tag verbatim when listing them. If the user wants to instrument an app against one, route them to `/kubit-integrate` to switch to or create a real workspace.
- Organizations in the `init` response may carry a `[created by: <name>]` annotation. Surface it verbatim alongside the org name (both for the current org and when listing other orgs) so the user can tell apart orgs they own from orgs created by colleagues.

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
