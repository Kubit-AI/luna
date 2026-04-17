---
name: connect
description: Use this skill when starting a Kubit session, switching organization or workspace, or creating a new workspace.
---

# /kubit-connect

## Overview

This skill sets up the Kubit context for the current session. This requires the user to have an
established connection to the Kubit Agent MCP server.

You will get a SESSION: parameter as part of the `init` and `switch` response. This parameter is required when calling all other MCP calls.

## When to Use

This skill should be invoked when:
- The user runs /kubit-connect for the first time
- The user wants to switch organization or workspace
- The user wants to create a new workspace
- Another Kubit skill needs to be called and you don't have SESSION on the context.

## Inputs

- `organization` — Kubit organization name or id (optional, prompted if needed)
- `workspace` — workspace name or ID (optional, prompted if needed)
- `action` - one of switch | create-workspace (opitonal, inferred from wording)

## Pre-flight: check for updates

Run this once at the start of the first-time init flow (Example 1). Skip for
switch / create-workspace.

```bash
CONFIG_DIR="{{KUBIT_CONFIG_DIR}}"
VERSION_FILE="$CONFIG_DIR/kubit/VERSION"
INSTALLED="$([ -f "$VERSION_FILE" ] && cat "$VERSION_FILE" || echo 0.0.0)"
LATEST="$(npm view @kubit/agent-plugin version 2>/dev/null)"

if [ -n "$LATEST" ] \
  && [ "$INSTALLED" != "$LATEST" ] \
  && [ "$(printf '%s\n%s\n' "$INSTALLED" "$LATEST" | sort -V | tail -1)" = "$LATEST" ]; then
  echo "kubit $INSTALLED → $LATEST available — run /kubit-update to upgrade."
fi
```

Stay silent on every other branch (already latest, ahead of latest, npm unreachable).
Always continue to `init` regardless — this notice is informational only.

## Rules

- Skip organization and workspace prompts if the user has only one of each
- Do not proceed to other skills if authentication is incomplete, or you don't have a 'session' obtained from `init` or `switch`.
- Do not persistently store the session token, keep it in context window and if it is lost - you can always request a new one using `init` or `switch`
- Refresh session after 1 hour idle (not a security timeout — just re-pins the workspace)
- orgId and workspaceId must always be passed as a pair to `switch`
- After creating a workspace, you get a session id back and can continue working into it immediately

## Examples

**Example 1 — First time access:**
Input: /kubit-connect

First, run the **Pre-flight: check for updates** step above.

Then call the `init` MCP tool, you will get information about the current user, organization and workspace.

Also get the list of other available organizations and workspaces.

**Example 2 — Switch org / workspace:**
Input: /kubit-connect switch workspace <workspace id>

Call the `switch` MCP call with the appropriate org and workspace IDs. The user may specify these with numeric id
or names.
Note that orgId and workspaceId come in pairs - you need to pass both when switching org/workspace.

**Example 3 — Create a new workspace:**
Input: /kubit-connect create workspace "workspace name"

Call: `workspace_create { name: "workspace name", session: <sessionId>, description: <optional>, timezone: <optional>}`

Timezone must be a valid timezone sting, if provided (e.g. "UTC", "America/Los_Angeles", etc). 

Prompt the user to select review all input params and give them ability to adjust, before proceeding.

This task can take 30 seconds or more, please indicate to the user to be patient.


## Gotchas

_to be added as we test._
