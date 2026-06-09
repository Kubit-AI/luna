# OpenAI Agents SDK Adapter

Covers both `openai-agents` (Python) and `@openai/agents` (JS/TS).

## 1. Dependency signals

- `openai-agents` in `pyproject.toml` / `requirements.txt`
- `@openai/agents` in `package.json` dependencies
- `from agents import Agent` / `from agents import function_tool`
- `import { Agent } from '@openai/agents'`

## 2. Trace-shape schema

Traces are workflows composed of spans. Span types the mapper cares about:

| Span type       | Key attributes                                               |
|-----------------|--------------------------------------------------------------|
| `agent`         | agent `name`, `instructions` (system prompt), tool list     |
| `generation`    | model, input messages, output messages                      |
| `function`      | tool `name` (possibly overridden), arguments, result        |
| `handoff`       | `from_agent`, `to_agent`                                    |
| `guardrail`     | guardrail `name`, triggered                                 |

Traces carry a `workflow_name`, `trace_id`, optional `group_id`, and metadata.
Spans have `span_id`, `parent_id`, start/end timestamps.

Minimal example:

```json
{
  "workflow_name": "Agent workflow",
  "trace_id": "trace_abc...",
  "spans": [
    {
      "span_id": "span_1",
      "type": "agent",
      "name": "CheckoutAgent",
      "instructions": "You help users complete their checkout..."
    },
    {
      "span_id": "span_2",
      "parent_id": "span_1",
      "type": "function",
      "name": "refund_order",
      "arguments": { "order_id": "12345" }
    }
  ]
}
```

## 3. Code-side conventions

Patterns to grep for agent registrations:

- `Agent\(\s*name\s*=\s*["']<NAME>["']` (Python)
- `new Agent\(\s*\{\s*name:\s*["']<NAME>["']` (TS/JS)

Patterns for tool registrations:

- `@function_tool\b` on a `def <NAME>` function (tool name = function name by default)
- `@function_tool\(\s*name_override\s*=\s*["']<NAME>["']` (explicit override — see ambiguity)
- `tool\(\s*\{\s*name:\s*["']<NAME>["']` (TS/JS)
- `handoff\(\s*agent\s*=\s*<NAME>` (Python) — maps handoff spans to the referenced Agent

For prompt mapping, search for:

- The `instructions=` argument to `Agent(...)` — the string literal or file
  content referenced by a loader (`Path("prompts/...").read_text()` etc.)

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `@function_tool(name_override="...")` is present — the trace tool name does
  not match the Python function name
- `Agent(name=...)` uses a variable, config lookup, or f-string rather than a
  literal
- `instructions=` references a path, template, or variable rather than a
  literal string — the prompt body in the trace may have been composed at
  runtime
- `handoff(agent=...)` references a variable (dynamic handoff)
- A custom trace processor is configured (e.g.
  `add_trace_processor(...)`) — span attributes may be renamed or filtered

## 5. Minimum required fields

The mapper needs at least one of:

- Agent span `name`
- Function span `name`
- Handoff `from_agent` / `to_agent`
- Agent span `instructions` (for prompt body match)

If the handoff carries only `trace_id` and timestamps, return
`status: "unresolved"` with reason "insufficient trace fields — need agent name,
tool name, or instructions".
