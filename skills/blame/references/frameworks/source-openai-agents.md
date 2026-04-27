# OpenAI Agents SDK Source Adapter (blame)

Covers OpenAI's first-party Agents SDK — Python `openai-agents` and
JS/TS `@openai/agents`. Spans flow through OTel via the
`opentelemetry-instrumentation-openai-agents-v2` (Python) or
`@traceloop/instrumentation-openai-agents` (JS) instrumentation
packages. The trailing `_agents` in the scope name distinguishes
this from vanilla OpenAI SDK auto-instrumentation.

**Cross-reference — OTel GenAI.** The Agents SDK populates
canonical `gen_ai.agent.*` and `gen_ai.tool.*` attributes; the
`opentelemetry.instrumentation.openai_agents` scope name is the
clean discriminator versus generic OTel GenAI manual emission.

## 1. Dependency signals

- Python — `pyproject.toml` / `requirements.txt`:
  - `openai-agents`
  - `opentelemetry-instrumentation-openai-agents-v2` (the OTel
    bridge — required for spans to ship)
- TypeScript — `package.json`:
  - `@openai/agents`
  - `@openai/agents-core`, `@openai/agents-openai`
  - `@traceloop/instrumentation-openai-agents` (or any peer
    instrumentor that targets the JS Agents SDK)
- Imports:
  - Python: `from agents import Agent, Runner, function_tool`,
    `from agents.tracing import` , `from agents.handoffs import`
  - TS/JS: `from "@openai/agents"`,
    `import { Agent, run, tool } from "@openai/agents"`
- Activation calls:
  - Python: `OpenAIAgentsInstrumentor().instrument()`
  - TS/JS: depends on the host instrumentor —
    `registerInstrumentations({ instrumentations: [new OpenAIAgentsInstrumentation()] })`
- Env vars: `OPENAI_API_KEY`,
  `OPENAI_AGENTS_DISABLE_TRACING=false` (default — Agents SDK
  ships its own internal trace stream, OTel bridge wraps it)

## 2. Trace-shape schema

**Primary instrumentation scope:** `opentelemetry.instrumentation.openai_agents`
(literal — note the trailing `_agents` distinguishes from the vanilla
`opentelemetry.instrumentation.openai` scope used for direct
ChatCompletion calls). Matches the
`opentelemetry.instrumentation.openai_agents` prefix in
`KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES`.

The Agents SDK emits spans for every Agent run, every tool call,
every handoff, and every guardrail invocation. Subset the mapper
uses:

| Attribute                          | Carries                                                     |
|------------------------------------|-------------------------------------------------------------|
| `gen_ai.agent.name`                | Agent name (from `Agent(name=...)`)                         |
| `gen_ai.agent.id`                  | Stable agent id                                             |
| `gen_ai.operation.name`            | `"create_agent" \| "invoke_agent" \| "execute_tool" \| "handoff" \| "guardrail"` |
| `gen_ai.tool.name`                 | Tool name (on `execute_tool` spans)                         |
| `gen_ai.tool.description`          | Tool description literal                                    |
| `gen_ai.tool.call.arguments`       | Tool call arguments (JSON)                                  |
| `gen_ai.tool.call.result`          | Tool call result (JSON)                                     |
| `gen_ai.request.model`             | Model id                                                    |
| `gen_ai.system_instructions`       | Agent instructions body                                     |
| `gen_ai.input.messages`            | Input messages (JSON array)                                 |
| `gen_ai.output.messages`           | Output messages (JSON array)                                |
| `gen_ai.conversation.id`           | Conversation / session id                                   |
| `openai.agents.handoff.from`       | Source agent on a handoff span                              |
| `openai.agents.handoff.to`         | Destination agent on a handoff span                         |
| `openai.agents.guardrail.name`     | Guardrail name (input or output guardrail)                  |
| `openai.agents.guardrail.kind`     | `"input" \| "output"`                                       |

The span `name` follows the Agents SDK convention:
`Agent: <name>` (top-level run), `Tool: <name>` (tool call),
`Handoff: <from> -> <to>`, `Guardrail: <name>`.

Minimal example (one agent run with a function tool call and a
handoff):

```json
{
  "trace_id": "t_abc",
  "spans": [
    {
      "name": "Agent: triage",
      "attributes": {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": "triage",
        "gen_ai.request.model": "gpt-4o",
        "gen_ai.system_instructions": "Route the user to the right specialist..."
      }
    },
    {
      "name": "Tool: lookup_order",
      "attributes": {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "lookup_order",
        "gen_ai.tool.call.arguments": "{\"order_id\":\"o_123\"}"
      }
    },
    {
      "name": "Handoff: triage -> billing",
      "attributes": {
        "gen_ai.operation.name": "handoff",
        "openai.agents.handoff.from": "triage",
        "openai.agents.handoff.to": "billing"
      }
    }
  ]
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given agent / tool /
handoff / guardrail was registered.

**Python:**

- `Agent\(\s*[^)]*name\s*=\s*["']<NAME>["']` — explicit agent name
  (commonly the first positional argument; tolerate keyword form too)
- `Agent\(\s*\n\s*name\s*=\s*["']<NAME>["']` — multi-line constructor
- `<VAR>\s*=\s*Agent\(` paired with `Runner\.run\(\s*<VAR>` /
  `Runner\.run_sync\(\s*<VAR>` / `Runner\.run_streamed\(\s*<VAR>`
- `@function_tool\b` decorator on a `def <NAME>` — tool name defaults
  to function name
- `@function_tool\(\s*name_override\s*=\s*["']<NAME>["']` — explicit
  override (the SDK uses `name_override`, not `name`)
- `FunctionTool\(\s*name\s*=\s*["']<NAME>["']` — direct construction
- `handoff\(\s*<AGENT_VAR>\s*\)` — handoff target is the referenced
  Agent variable; resolve via the `<VAR> = Agent(...)` definition
- `handoffs\s*=\s*\[\s*<AGENT_VAR>` — handoff list inside an Agent
  constructor
- `InputGuardrail\(\s*[^)]*name\s*=\s*["']<NAME>["']` /
  `OutputGuardrail\(\s*[^)]*name\s*=\s*["']<NAME>["']`
- `@input_guardrail\b` / `@output_guardrail\b` decorator on a
  `def <NAME>` — guardrail name defaults to function name

**JS / TS:**

- `new\s+Agent\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `Agent\.create\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `tool\(\s*\{\s*[^}]*name:\s*["']<NAME>["']` — `tool({ name, parameters, execute })`
  helper from `@openai/agents`
- `handoff\(\s*<AGENT_VAR>\s*\)` (same pattern as Python)
- `handoffs:\s*\[\s*<AGENT_VAR>` inside an `Agent` config
- `inputGuardrail\(\s*\{\s*[^}]*name:\s*["']<NAME>["']` /
  `outputGuardrail\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`

**System-instruction matching.** When the trace carries
`gen_ai.system_instructions`, substring-match the decoded body
against the `instructions=` argument in `Agent(...)` constructors.
Common patterns to grep:

- `instructions\s*=\s*["']<BODY>["']` (Python)
- `instructions\s*=\s*[A-Z_][A-Z0-9_]*` paired with a module-level
  constant (`AGENT_INSTRUCTIONS = "..."`)
- `instructions\s*=\s*<FUNC>\(` paired with a function returning the
  instructions string — flag as ambiguous if the function is dynamic

**Tool/agent ambiguity at call site.** `Runner.run(...)` accepts an
Agent and an input; tool selection happens at runtime via the model.
Tool spans therefore appear under the run span without naming the
producing site directly — fall back to the Agent's `tools=[...]`
list to find the call site.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `Agent(...)` `name=` is a variable, f-string, or template literal
  rather than a string literal.
- Multiple `Agent(name="<NAME>", ...)` definitions share the same
  name across files.
- `instructions=` is loaded from a file (`Path(...).read_text()`,
  `open(...).read()`) or composed via f-string — body cannot be
  matched literally.
- `@function_tool` wraps a generically named function (`def lookup`,
  `def search`, `def fetch`).
- `handoff(<VAR>)` references an Agent variable defined in another
  module that re-exports it under multiple aliases.
- `tools=[...]` is built dynamically (list comprehension, conditional
  filter) — the mapping from tool name to call site is config-driven.
- A guardrail name appears under both `@input_guardrail` and
  `@output_guardrail` registrations and the trace lacks
  `openai.agents.guardrail.kind`.

## 5. Minimum required fields

The mapper needs at least one of:

- `gen_ai.agent.name` (best — matches `Agent(name=...)`)
- `gen_ai.tool.name` (matches `@function_tool` on a `def` or
  `tool({ name: ... })`)
- `openai.agents.handoff.from` + `openai.agents.handoff.to`
  (matches a `handoff(...)` call site)
- `openai.agents.guardrail.name` plus `.kind`
- `gen_ai.system_instructions` body for substring match against
  `instructions=` literals

If only `gen_ai.agent.id` and timestamps are present, return
`status: "unresolved"` with reason "insufficient trace fields —
opaque agent id without name cannot be grepped against code".
