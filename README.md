# Kubit agent plugin

An agent plugin that adds `/kubit-*` skills to Claude Code and Cursor for working with the Kubit LLM-ops platform — inspecting traces and building analytics reports.

## Skills

| Command            | Purpose                                                          |
| :----------------- | :--------------------------------------------------------------- |
| `/kubit-blame`     | Find the code change behind a trace regression (downstream of report / inspect) |
| `/kubit-connect`   | Authenticate and select the current org / workspace              |
| `/kubit-help`      | List all kubit skills and how to use them                        |
| `/kubit-inspect`   | Inspect users, sessions, traces, and events                      |
| `/kubit-integrate` | Wire your LLM app's tracing into Kubit — detects sinks (Langfuse, Braintrust) and sources (Vercel AI, OTel GenAI, LangChain) |
| `/kubit-report`    | Find, run, or create analytics reports                           |
| `/kubit-update`    | Check npm for a new version and install it                       |

## Install

```bash
npx @kubit-ai/agent-plugin              # prompts for Claude Code, Cursor, or both
```

Flags: `--global` (default, user-wide) or `--local` (current directory); `--uninstall` to remove; `--yes` to skip the location prompt (runtime is always prompted).

After install, restart the runtime and try `/kubit-help`.

## Updating

Run `/kubit-update` inside the runtime. The skill reads the installed version from `<config>/kubit/VERSION`, checks npm for a newer release, shows the changelog slice you haven't seen yet, and re-runs the installer with your confirmation.

## MCP server

The plugin bundles a `.mcp.json` that auto-wires Claude Code to the Kubit MCP server.

## License

Source-available. See [LICENSE](./LICENSE) — Copyright (c) Kubit Inc., all rights reserved.
