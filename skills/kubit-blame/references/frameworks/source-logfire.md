# Logfire / Pydantic AI Source Adapter (blame)

Covers Pydantic's Logfire SDK and its Pydantic AI agent framework
(both Python). Logfire emits OTel spans under the `logfire`
instrumentation scope and adds the `pydantic_ai.*` attribute family
when Pydantic AI is in use.

**Cross-reference — OTel GenAI.** Pydantic AI emits canonical
`gen_ai.*` attributes alongside `pydantic_ai.*`. Repos that also
use raw OTel GenAI manual spans may produce overlapping identifier
matches; the `logfire` scope name is the cleanest discriminator.

## 1. Dependency signals

- Python — `pyproject.toml` / `requirements.txt`:
  - `logfire`
  - `pydantic-ai` (or `pydantic-ai-slim`)
  - `logfire[<extra>]` extras (e.g. `logfire[fastapi]`,
    `logfire[anthropic]`, `logfire[openai]`)
- Imports:
  - `import logfire`, `from logfire import`
  - `from pydantic_ai import Agent, RunContext`,
    `from pydantic_ai.tools import Tool`,
    `from pydantic_ai.messages import ModelRequest, ModelResponse`
- Activation calls:
  - `logfire.configure(`, `logfire.instrument_pydantic_ai()`,
    `logfire.instrument_openai()`, `logfire.instrument_anthropic()`,
    `logfire.instrument_httpx()`
- Env vars: `LOGFIRE_TOKEN`, `LOGFIRE_PROJECT`, `LOGFIRE_SEND_TO_LOGFIRE`
- Pydantic AI is Python-only; there is no first-party JS/TS port.

## 2. Trace-shape schema

**Primary instrumentation scope:** `logfire` (and any `logfire.*`
sub-scope). Matches the `logfire` prefix in
`KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES`.

Logfire spans use the `logfire.*` namespace for SDK-specific
metadata, plus canonical `gen_ai.*` for model / agent / tool
fields, plus `pydantic_ai.*` for Pydantic AI-specific payloads.
Subset the mapper uses:

| Attribute                       | Carries                                                  |
|---------------------------------|----------------------------------------------------------|
| `logfire.span_type`             | `"span" \| "log" \| "pending_span"`                      |
| `logfire.tags`                  | User-supplied tags array                                 |
| `logfire.msg`                   | Span message template (`logfire.span("...")` argument)   |
| `logfire.msg_template`          | Original template before interpolation                   |
| `logfire.level_num`             | Numeric level (mirrors `level_name`)                     |
| `gen_ai.agent.name`             | Pydantic AI `Agent(name=...)` value                      |
| `gen_ai.tool.name`              | Tool name (from `@agent.tool` decorator)                 |
| `gen_ai.request.model`          | Model id                                                 |
| `gen_ai.system_instructions`    | System prompt body (JSON-encoded)                        |
| `gen_ai.input.messages`         | Input messages (JSON array)                              |
| `gen_ai.output.messages`        | Output messages (JSON array)                             |
| `pydantic_ai.all_messages`      | Full message-history blob (JSON)                         |
| `pydantic_ai.usage`             | Aggregated token usage                                   |
| `code.filepath` / `code.lineno` | Source location of the `logfire.span(...)` call          |
| `code.function`                 | Enclosing Python function name                           |

The span `name` carries either the `logfire.span("...")` template
argument, the agent operation (`agent run`, `agent run stream`,
`tool call <name>`), or the function name when `@logfire.instrument`
decorates the function.

Minimal example (one Pydantic AI agent run with a tool call):

```json
{
  "trace_id": "t_abc",
  "spans": [
    {
      "name": "agent run",
      "attributes": {
        "logfire.span_type": "span",
        "gen_ai.agent.name": "support-triage",
        "gen_ai.request.model": "gpt-4o",
        "gen_ai.system_instructions": "You triage incoming support tickets...",
        "code.filepath": "app/agents/triage.py",
        "code.function": "triage_agent"
      }
    },
    {
      "name": "tool call lookup_order",
      "attributes": {
        "logfire.span_type": "span",
        "gen_ai.tool.name": "lookup_order",
        "code.filepath": "app/agents/triage.py"
      }
    }
  ]
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given Logfire span,
agent, or tool was registered.

**Logfire spans (manual instrumentation):**

- `logfire\.span\(\s*["']<MSG>["']` — explicit span message; the
  `logfire.msg_template` attribute matches `<MSG>` before
  interpolation
- `logfire\.span\(\s*f["']<MSG>["']` — f-string template (treat as
  ambiguous — interpolated at runtime)
- `@logfire\.instrument\(` decorator on a `def <NAME>` — function
  name becomes span name unless `name=` is passed
- `@logfire\.instrument\(\s*["']<NAME>["']` — explicit name argument
- `logfire\.info\(\s*["']<MSG>["']` / `logfire\.warn` / `logfire\.error`
  — log records that may also surface as spans

**Pydantic AI agents:**

- `Agent\(\s*[^,)]*name\s*=\s*["']<NAME>["']` — explicit agent name
  matching `gen_ai.agent.name`
- `Agent\(\s*["']<MODEL>["']` — model-only constructor; agent name
  defaults to a generated value (treat as ambiguous)
- `<VAR>\s*=\s*Agent\(` paired with subsequent `<VAR>.run(`,
  `<VAR>.run_sync(`, `<VAR>.run_stream(` call sites

**Pydantic AI tools:**

- `@<AGENT>\.tool\b` decorator on a `def <NAME>` — tool name defaults
  to function name
- `@<AGENT>\.tool\(\s*name\s*=\s*["']<NAME>["']` — explicit override
- `@<AGENT>\.tool_plain\b` decorator
- `@<AGENT>\.system_prompt\b` decorator on a `def <NAME>` returning
  the system instructions body — pair with `gen_ai.system_instructions`
  substring match
- `Tool\(\s*[^,]+,\s*name\s*=\s*["']<NAME>["']` — explicit `Tool(...)`
  construction passed via `tools=[...]`

**Source-location attributes (primary path).** Logfire emits
`code.filepath`, `code.lineno`, and `code.function` on every span
when `inspect_arguments=True` (default). When present, these point
directly at the call site and short-circuit grep entirely. Use them
as the strongest identifier; fall back to grep only when missing.

**Prompt-body matching.** When the trace carries
`gen_ai.system_instructions` or `pydantic_ai.all_messages`,
substring-match the decoded body against `@<agent>.system_prompt`
function bodies, in-source string literals, and `prompts/*.{md,yaml}`.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- `logfire.span("...")` uses an f-string or `.format(...)` template —
  the trace's `logfire.msg` was interpolated at runtime and will not
  match the source literal directly.
- `Agent(...)` is constructed without an explicit `name=` argument
  and multiple agents in the repo share the default-name pattern.
- `@<agent>.tool` decorates a generically named function
  (`def lookup`, `def fetch`, `def search`).
- The trace has no `code.filepath` / `code.lineno` (e.g. emitted by a
  background instrumentor) **and** the span name matches a built-in
  Pydantic AI operation (`agent run`, `tool call`).
- `logfire.configure(...)` is called more than once with different
  service names — span attribution may flip between modules.

## 5. Minimum required fields

The mapper needs at least one of:

- `code.filepath` + `code.function` (best — direct source pointer)
- `gen_ai.agent.name` (matched against `Agent(name=...)`)
- `gen_ai.tool.name` (matched against `@<agent>.tool` on a `def`)
- `logfire.msg_template` (matched against `logfire.span("...")`)
- `gen_ai.system_instructions` body (matched against `@<agent>.system_prompt`
  function bodies or prompt files)

If only `logfire.tags` and timestamps are present, return
`status: "unresolved"` with reason "insufficient trace fields —
need code location, agent name, tool name, span template, or system
instructions body".
