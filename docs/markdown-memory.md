# Markdown Memory

This fork includes a built-in Markdown memory plugin focused on coding work.

## Storage

- Global memory: `~/.config/opencode/memory/`
- Project memory: `<project>/docs/memory/`
- Global files: `preferencias.md` and `regras.md`
- Project files: `decisions.md`, `troubleshooting.md`, `contexto.md`, and `infos.md`

The plugin reads both scopes into the model context without mixing project-specific data. It writes only validated, reusable summaries and ignores secrets, raw transcripts, logs, and failed attempts.

## Automatic learning

After a completed coding task, the model may emit a structured internal `MEMORY_SUGGESTION` block. The plugin validates and saves one categorized entry, then shows a toast containing the path and summary. Duplicate lessons are ignored.

Natural-language requests are supported:

- “remova essa memória”
- “apague a última anotação”
- “isso está errado, corrija”

These remove only the latest relevant entry, not the whole file.

## Templates

Starter project memory files are available under `docs/memory/templates/`.
