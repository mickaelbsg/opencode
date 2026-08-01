# Hindsight Memory

This fork includes an opt-in Hindsight memory plugin for the legacy OpenCode
plugin API.

## Enable

Create `~/.config/opencode/hindsight.json`. The built-in plugin remains inert
when this file does not exist. Configure the Hindsight REST API, bank, memory
mode, recall settings, retention settings, privacy patterns, and keyword
patterns in that file.

The complete local configuration and deployment guide is available at
`~/.config/opencode/README-hindsight.md`.

## Features

- Auto-recall injects relevant memories into the model system context.
- Auto-retain stores tool results and session summaries.
- Keyword detection stores messages beginning with configured phrases such as
  `remember that ...` or `lembre que ...`.
- Retained memories receive project and feature tags.
- `recall` and `reflect` are supported as prefetch methods.
- `hindsight_memory_recall`, `hindsight_memory_retain`, and
  `hindsight_memory_reflect` are registered as native OpenCode tools.

## Safety and performance

- Hindsight requests use configurable timeouts and never block model execution
  during retention.
- Session summaries are retained at most once per OpenCode session.
- Common API keys, tokens, passwords, and bearer credentials are redacted.
- `max_retain_chars` limits the size of each retained memory.
- Additional regular expressions can be supplied through `redact_patterns`.

Example additional settings:

```json
{
  "prefetch_method": "reflect",
  "recall_timeout_ms": 1500,
  "retain_timeout_ms": 1500,
  "max_retain_chars": 4000,
  "redact_patterns": ["customer_id=\\w+"]
}
```

## Runtime behavior

The plugin uses Hindsight's REST API because OpenCode plugins cannot invoke MCP
tools directly. Network failures are isolated to the plugin hook and do not
change the model request flow. The fork also exposes native OpenCode tools so
the model can request recall, retention, or reflection explicitly.
