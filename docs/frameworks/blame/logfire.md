# Pydantic Logfire Adapter

Covers Pydantic Logfire's `logfire` SDK. Python is primary (richest API);
TypeScript and Rust SDKs exist but are thinner. Logfire is built on
OpenTelemetry and emits OTel spans, so `otel-genai.md` catches many
auto-instrumented LLM traces; this adapter covers Logfire's own
`@logfire.instrument` and `logfire.span(...)` patterns that are
user-registered rather than vendor-auto-instrumented.

**Cross-reference:** For non-Python Logfire deployments (TS, Rust, or any
language exporting via OTLP to Logfire), prefer `otel-genai.md`.

## 1. Dependency signals

Python:

- `logfire` in `pyproject.toml` / `requirements.txt`
- `logfire[openai]`, `logfire[anthropic]`, `logfire[langchain]`,
  `logfire[pydantic-ai]`, `logfire[litellm]` optional-extras markers
- `import logfire` or `from logfire import ...`
- `logfire\.configure\(` call

TypeScript / JS:

- `@pydantic/logfire-browser` or `@pydantic/logfire-api` in `package.json`
- `import logfire from "@pydantic/logfire-api"`

Env vars:

- `LOGFIRE_TOKEN`, `LOGFIRE_PROJECT`, `LOGFIRE_ENVIRONMENT`

## 2. Trace-shape schema

Spans follow OTel conventions. Logfire-specific attributes:

| Field                          | Type     | Carries                                      |
|--------------------------------|----------|----------------------------------------------|
| `name`                         | string   | Span name — often `Calling <module>.<fn>`    |
| `logfire.msg_template`         | string   | f-string template the user wrote             |
| `logfire.msg`                  | string   | Rendered message                             |
| `logfire.span_type`            | string   | `"span"`, `"log"`, or `"pending_span"`       |
| `code.function` / `code.namespace` / `code.filepath` / `code.lineno` | string/int | Source location Logfire captures automatically |
| `gen_ai.*`                     | varies   | Standard OTel GenAI when using `logfire[...]` integrations |

When the `logfire[openai]` / `logfire[anthropic]` / `logfire[pydantic-ai]`
integrations are active, LLM calls emit standard `gen_ai.*` spans plus
Logfire `code.*` source-location attributes — those `code.*` attributes
are the strongest possible mapper signal and should always be used first
if present.

Minimal example:

```json
{
  "spans": [
    {
      "name": "Applying my_function to x=3 and y=4",
      "attributes": {
        "logfire.msg_template": "Applying my_function to {x=} and {y=}",
        "logfire.span_type": "span",
        "code.function": "my_function",
        "code.namespace": "app.workers",
        "code.filepath": "app/workers.py",
        "code.lineno": 42
      }
    }
  ]
}
```

## 3. Code-side conventions

**Python** — the canonical registrations:

- `@logfire\.instrument\b` on a `def <NAME>` (default span name is
  `Calling <module>.<NAME>`)
- `@logfire\.instrument\(\s*["']<TEMPLATE>["']` — custom span name or
  template literal (e.g. `'Applying my_function to {x=} and {y=}'`)
- `@logfire\.instrument\([^)]*extract_args\s*=\s*False` — args suppressed
- `with\s+logfire\.span\(\s*["']<NAME>["']` — context-manager span
- `logfire\.info\(\s*["']<MSG>["']` / `logfire\.(debug|warn|error)\(` —
  single-event logs (still show up as spans of type `"log"`)

**TypeScript** — thinner surface:

- `logfire\.span\(\s*["']<NAME>["']`
- `logfire\.info\(\s*["']<MSG>["']`

**Source-location shortcut.** If the trace carries `code.filepath` and
`code.lineno` attributes (which Logfire attaches automatically), the
mapper should use them directly as a confirmed candidate — no grep
needed. Return `status: "confirmed"` with that file and line.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- Span `name` is the rendered `logfire.msg` (with interpolated variable
  values) rather than the `logfire.msg_template` literal — grep should
  match the template, not the rendered message.
- Multiple `@logfire.instrument` decorators share the same template
  string.
- `@logfire.instrument` sits inside a closure or factory where
  `code.function` does not uniquely identify a source line.
- Logfire scrubbing (`logfire.configure(scrubbing=...)`) is enabled — the
  span message in the trace may have tokens redacted, so substring
  matching against source literals will miss.
- `logfire.span(name, **attributes)` receives the `name` from a variable.

## 5. Minimum required fields

Mapper needs at least one of (in priority order):

1. `code.filepath` + `code.lineno` — strongest, bypass grep entirely.
2. `code.function` + `code.namespace` — grep-narrow to the module, then
   match the function.
3. Span `name` or `logfire.msg_template` literal.
4. `gen_ai.prompt.*` content (via Logfire's LLM integrations).

If the handoff carries only `trace_id` and timestamps, return
`status: "unresolved"` with reason "insufficient trace fields — need
code.filepath, code.function, span name, or logfire.msg_template".
