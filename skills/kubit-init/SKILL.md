---
name: kubit-init
description: Use this skill to establish a session with Kubit and manage current org and workspace.
---

# kubit-init

## Overview

This skill sets up the Kubit context for the current session.

## When to Use

This skill should be invoked when:
- The user runs /kubit-init for the first time
- The user wants to switch organization or workspace
- Another Kubit skill fails due to missing org id or workspace

## Inputs

- `organization` — Kubit organization name or id (optional, prompted if needed)
- `workspace` — workspace name or ID (optional, prompted if needed)

## Rules

- Skip organization and workspace prompts if the user has only one of each
- Do not proceed to other skills if authentication is incomplete


**Example 1 — First time access:**
Input: /kubit-init

Call the `kubit-init` MCP tool, you will get information about the current user, organization and workspace.

**Example 2 — Switch org / workspace:**
Input: /kubit-init switch workspace <workspace id>

Call the `kubit-switch` MCP call with the appropriate org and workspace IDs. The user may specify these with numeric id
or names.
Note that orgId and workspaceId come in pairs - you need to pass both when switching org/workspace.
