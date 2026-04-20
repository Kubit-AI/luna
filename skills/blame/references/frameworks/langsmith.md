# LangSmith / LangChain Adapter

## 1. Dependency signals

Grep these patterns in manifests and imports:

- `langsmith` (any version) in `pyproject.toml`, `requirements.txt`, `package.json`
- `langchain` or `langchain-*` subpackages
- `from langsmith` or `import langsmith` in Python
- `from "langsmith"` in TS/JS
- `LANGSMITH_TRACING`, `LANGCHAIN_TRACING_V2` env-var references

## 2. Trace-shape schema

LangSmith's stable unit is the `Run` / `RunTree`. Every run has:

| Field        | Type                              | Carries                             |
|--------------|-----------------------------------|-------------------------------------|
| `name`       | string                            | Human-chosen component name        |
| `run_type`   | `"llm" \| "chain" \| "tool"`      | Role of the run                    |
| `inputs`     | object                            | Prompt messages for LLM runs       |
| `outputs`    | object (nullable)                 | Generated text / tool result       |
| `error`      | string (nullable)                 | Failure reason                     |
| `parent_run_id` | uuid (nullable)                | Tree edge                          |
| `tags`       | string[]                          | User-added labels                  |

Minimal example:

```json
{
  "name": "Intent Classification",
  "run_type": "llm",
  "inputs": {
    "messages": [
      { "role": "system", "content": "Classify the user intent." },
      { "role": "user", "content": "I need help with my order" }
    ]
  },
  "outputs": { "intent": "order_inquiry", "confidence": 0.95 },
  "parent_run_id": "b1e8..."
}
```

## 3. Code-side conventions

Grep patterns the mapper uses to find where a given `name` was registered:

- `RunTree\(\s*name\s*=\s*["']<NAME>["']` — manual RunTree construction
- `@traceable\(` followed within ~3 lines by `name\s*=\s*["']<NAME>["']`
- `@traceable` decorator on a `def <NAME>` function (the function name becomes the run name by default)
- `\.as_tool\(\s*name\s*=\s*["']<NAME>["']` — LangChain tool alias
- `StructuredTool\.from_function\(.*name\s*=\s*["']<NAME>["']`
- LangChain chain classes where the class name becomes the default run name:
  `class\s+<NAME>.*(Chain|Agent|Runnable)`

For prompt-body mapping, search prompt template files for substrings of the
trace's `inputs.messages[*].content`, preferring exact literal matches over
fuzzy matches.

## 4. Ambiguity signals

Force `status: "ambiguous"` when any of these apply:

- Run `name` comes from a variable, f-string, or config lookup rather than a
  literal (grep pattern: `RunTree\(\s*name\s*=\s*[^"'\)]` — anything not a
  string literal)
- Multiple `@traceable` decorators with the same `name` argument exist
- Prompt text contains template placeholders (`{var}`, `{{var}}`, Jinja tags)
  — the runtime-rendered prompt may differ from any literal in the repo
- A `name_override` or `run_name` argument appears in `with_config(...)` or
  `.with_config(run_name=...)` — the observed name may be set at call time

## 5. Minimum required fields

The mapper needs at least one of:

- `name` (to grep for code-side registrations)
- `inputs.messages[].content` (to substring-match prompt files)
- A tool-name attribute (for `run_type: "tool"`)

If the handoff carries only `run_id` and timestamps, the mapper returns
`status: "unresolved"` with reason "insufficient trace fields — need run name or
prompt body".
