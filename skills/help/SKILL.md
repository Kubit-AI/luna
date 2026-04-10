---
name: help
description: "Use this skill to list and explain available Kubit skills. Use for: help, what can you do, list skills, available commands, getting started, how do I, what is kubit."
---
# /kubit:help

## Overview

This skill is the discovery index for the Kubit plugin. It lists all available
skills and routes users to the right one for their task. No authentication required.

## Steps
1. If no specific skill is requested, display the full skill list:
    /kubit:init       — Authenticate and connect to Kubit
    /kubit:help       — List skills and how to use them (you are here)
    /kubit:inspect    — Inspect users, sessions, traces, and events
    /kubit:report     — Find, run, or create analytics reports
    /kubit:trace      — Look up analytics traces by name or ID
    /kubit:blame      — Trace errors back to agents, skills, or prompts
    /kubit:dataset    — Add or update golden data sets and test suites
    /kubit:workflows  — Chain skills together into automated pipelines
    Type any skill name to invoke it, or /kubit:help <skill-name> for details.
2. If a specific skill is requested, explain it:
   - What it does
   - Its inputs
   - One or two example invocations
3. If the user describes a task but is unsure which skill to use,
   identify the best match and suggest it with an example invocation

## Rules
- Never require authentication — this skill must work before /kubit:init
- Never invent skills that do not exist
- Keep the skill list accurate — update it whenever a new skill is added
- One line per skill in the summary view; detail only on specific request

## Gotchas
- If a user asks about a capability that is not yet built, say so clearly
  rather than describing something fictional
- If the skill list gets out of sync with what is actually installed,
  users will get confused — treat this list as a contract, not a comment
