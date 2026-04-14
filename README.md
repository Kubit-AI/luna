# Kubit plugin for Claude Code

A Claude Code plugin that adds the `/kubit:*` skills for working with the Kubit LLM-ops platform — inspecting traces, building reports, managing golden datasets, and tracing failures back to the prompts that produced them.

This repo is both the plugin and a self-hosted marketplace, so it can be installed in two commands.

## Skills

| Command            | Purpose                                                          |
| :----------------- | :--------------------------------------------------------------- |
| `/kubit:init`      | Authenticate and select the current org / workspace              |
| `/kubit:help`      | List all kubit skills and how to use them                        |
| `/kubit:inspect`   | Inspect users, sessions, traces, and events                      |
| `/kubit:report`    | Find, run, or create analytics reports                           |
| `/kubit:blame`     | Trace errors back to agents, skills, prompts, or model versions  |
| `/kubit:dataset`   | Add to or update golden datasets and evaluation test suites      |
| `/kubit:workflows` | Chain kubit skills together into reusable pipelines              |

## Install

```text
/plugin marketplace add git@bitbucket.org:kubitai/luna.git
/plugin install kubit@kubit-plugins
```

If you use SSH with Bitbucket instead:

```text
/plugin marketplace add git@bitbucket.org:kubitai/luna.git
```

To pin to a specific branch or tag, append `#<ref>` (e.g. `…/luna.git#v0.1.0`). After install, restart Claude Code (or run `/reload-plugins`) and try `/kubit:help`.

## MCP server

The plugin bundles a `.mcp.json` that wires Claude Code to the Kubit MCP server at `https://agent-int.kubit.ai/mcp` automatically. The server uses standard OAuth — Claude Code will open a browser for you to sign in the first time you use any `/kubit:*` skill that needs the MCP.

## Local development

To work on the plugin without publishing it:

```bash
git clone <this repo>
claude --plugin-dir ./luna
```

Iterate on a SKILL.md, then run `/reload-plugins` inside the session to pick up changes. Bump `version` in `.claude-plugin/plugin.json` before sharing changes — Claude Code uses the version to decide whether to update installed copies.

## Layout

```
luna/
├── .claude-plugin/
│   ├── plugin.json          # plugin manifest
│   └── marketplace.json     # marketplace catalog (this repo IS the marketplace)
├── .mcp.json                # bundled kubit MCP server config
└── skills/
    ├── init/SKILL.md
    ├── help/SKILL.md
    ├── inspect/SKILL.md
    ├── report/SKILL.md
    ├── blame/SKILL.md
    ├── dataset/SKILL.md
    └── workflows/SKILL.md
```

## License

Proprietary. See [LICENSE](./LICENSE).
