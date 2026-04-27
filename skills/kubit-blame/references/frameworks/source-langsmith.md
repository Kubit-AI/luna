# LangSmith Source Adapter (blame)

Covers LangSmith's first-party SDK (Python `langsmith`, JS
`langsmith`). LangSmith routinely traces LangChain / LangGraph apps
when `LANGCHAIN_TRACING_V2=true` is set, but it is also used
standalone via the `@traceable` decorator and the `RunTree` API.

**Cross-reference — LangChain.** When `langchain` is detected
alongside LangSmith, span names typically map to LangChain Runnable
class names rather than user-defined `@traceable` names. Combine
this adapter's identifier hints with `source-langchain.md` §3
patterns; flag overlapping matches as ambiguous.

## 1. Dependency signals

- Python — `pyproject.toml` / `requirements.txt` / `Pipfile`:
  - `langsmith`
- TypeScript — `package.json` `dependencies` / `devDependencies`:
  - `langsmith`
- Imports:
  - Python: `from langsmith import`, `import langsmith`,
    `from langsmith.run_helpers import traceable`,
    `from langsmith.run_trees import RunTree`
  - TS/JS: `from "langsmith"`, `from "langsmith/traceable"`,
    `from "langsmith/run_trees"`
- Decorators / wrappers in source:
  - Python: `@traceable` decorator literal
  - TS/JS: `traceable(` wrapper call literal
- Env vars: `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`,
  `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY`,
  `LANGSMITH_PROJECT`, `LANGCHAIN_PROJECT`

## 2. Trace-shape schema

**Primary instrumentation scope:** `langsmith` (and any
`langsmith.*` sub-scope). Matches the `langsmith` prefix in
`KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES`.

LangSmith emits one span per LangSmith *run*. Every run carries:

| Attribute / field             | Carries                                                  |
|-------------------------------|----------------------------------------------------------|
| `langsmith.run_type`          | `"llm" \| "chain" \| "tool" \| "retriever" \| "embedding" \| "prompt" \| "parser"` |
| `langsmith.run_id`            | Stable run id (uuid)                                     |
| `langsmith.metadata.*`        | User-supplied metadata keys                              |
| `langsmith.tags`              | User-supplied tags array                                 |
| `langsmith.usage_metadata`    | JSON blob with token counts                              |
| `gen_ai.prompt.<n>.role`      | Legacy indexed input messages                            |
| `gen_ai.prompt.<n>.content`   | Legacy indexed input message body                        |
| `gen_ai.completion.<n>.role`  | Legacy indexed output messages                           |
| `gen_ai.completion.<n>.content` | Legacy indexed output message body                     |

The span `name` carries either the user-supplied `name=` from
`@traceable` / `RunTree(...)`, or the underlying function name
when `name=` is omitted.

Minimal example (one `@traceable`-decorated function calling an LLM):

```json
{
  "name": "summarize-thread",
  "attributes": {
    "langsmith.run_type": "chain",
    "langsmith.metadata.session_id": "s_abc",
    "gen_ai.prompt.0.role": "system",
    "gen_ai.prompt.0.content": "You summarize support threads...",
    "gen_ai.prompt.1.role": "user",
    "gen_ai.prompt.1.content": "Thread #1234..."
  }
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given run name was
registered.

**Python:**

- `@traceable\(\s*name\s*=\s*["']<NAME>["']` — explicit name override
- `@traceable\(\s*run_type\s*=\s*["'](chain|tool|llm|retriever)["']`
  — typed run; pair with adjacent `def <NAME>` for default name match
- `@traceable\b` decorator on a `def <NAME>` (function name becomes
  run name by default)
- `RunTree\(\s*name\s*=\s*["']<NAME>["']`
- `Client\(\s*\)\.create_run\(\s*name\s*=\s*["']<NAME>["']`
- `wrap_openai\(` — auto-instruments OpenAI calls; child run names
  default to OpenAI operation names

**JS / TS:**

- `traceable\(\s*[^,]+,\s*\{\s*[^}]*name:\s*["']<NAME>["']` — the
  `traceable(fn, { name: ... })` wrapper
- `new\s+RunTree\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `Client\([^)]*\)\.createRun\(\s*\{\s*[^}]*name:\s*["']<NAME>["']`
- `wrapOpenAI\(` — auto-instruments OpenAI calls; default run names
  follow the OpenAI operation

**Auto-instrumented LangChain runs.** When
`LANGCHAIN_TRACING_V2=true` is set, every Runnable execution
produces a LangSmith run whose `name` is the Runnable class name
(`ChatOpenAI`, `RunnableSequence`, etc.) or the
`with_config({"run_name": ...})` override. Treat the trace name as
LangChain-shaped and apply `source-langchain.md` §3 patterns.

**Prompt-body matching.** When the trace carries
`gen_ai.prompt.<n>.content`, substring-match the decoded body
against `from_template(...)` / `fromTemplate(...)` literals,
prompt registry files (`prompts/*.yaml`, `prompts.py`), and
`pull_prompt(...)` / `pullPrompt(...)` arguments.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- The `name` argument is a variable, f-string, or template literal
  rather than a string literal.
- Multiple `@traceable` registrations share the same name.
- `LANGCHAIN_TRACING_V2=true` is set **and** the trace name
  matches a LangChain Runnable class default — the same name
  appears at every LCEL composition point. Defer to
  `source-langchain.md` §4.
- Bare `@traceable` on a generically named function (`def handler`,
  `def run`, `def process`) — even a single match should be treated
  as ambiguous because the same run name is likely to appear in
  multiple places.
- `wrap_openai(...)` / `wrapOpenAI(...)` is used in more than one
  place — auto-generated child run names are non-unique across call
  sites.

## 5. Minimum required fields

The mapper needs at least one of:

- Run `name` (non-generic — i.e. user-defined via `@traceable`,
  `RunTree`, or `with_config({"run_name": ...})`)
- `langsmith.run_type` plus enough metadata to disambiguate
- `gen_ai.prompt.<n>.content` for substring match against prompt
  templates / string literals in the repo

If only `langsmith.run_id` and timestamps are present, return
`status: "unresolved"` with reason "insufficient trace fields —
need run name, run type, or prompt body".
