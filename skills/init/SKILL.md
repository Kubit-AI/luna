---
name: init
description: Use this skill to establish a session with Kubit and manage current org and workspace.
---

# /kubit:init

## Overview

This skill sets up the Kubit context for the current session. This requires the user to have an
established connection to the Kubit Agent MCP server.

You will get a SESSION: parameter as part of the `kubit_init` and `kubit_switch` response. This parameter is required when calling all other MCP calls.

## When to Use

This skill should be invoked when:
- The user runs /kubit:init for the first time
- The user wants to switch organization or workspace
- Another Kubit skill needs to be called and you don't have SESSION on the context.

## Inputs

- `organization` — Kubit organization name or id (optional, prompted if needed)
- `workspace` — workspace name or ID (optional, prompted if needed)

## Rules

- Skip organization and workspace prompts if the user has only one of each
- Do not proceed to other skills if authentication is incomplete, or you don't have a 'session' obtained from `kubit_init` or `kubit_switch`.
- Do not persistently store the session token, keep it in context window and if it is lost - you can always request a new one using `kubit_init` or `kubit_switch`
- You should obtain a new session id if the user was idle for more than one hour. This session id is not for security purposes, it is only used to pin the current workspace and organization id. 

## Examples

**Example 1 — First time access:**
Input: /kubit:init

Call the `kubit_init` MCP tool, you will get information about the current user, organization and workspace.

**Example 2 — Switch org / workspace:**
Input: /kubit:init switch workspace <workspace id>

Call the `kubit_switch` MCP call with the appropriate org and workspace IDs. The user may specify these with numeric id
or names.
Note that orgId and workspaceId come in pairs - you need to pass both when switching org/workspace.
