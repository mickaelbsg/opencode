# Hindsight Memory

This fork includes an opt-in Hindsight memory plugin for the legacy OpenCode
plugin API.

## Enable

Create `~/.config/opencode/hindsight.json`. The built-in plugin remains inert
when this file does not exist. Configure the Hindsight REST API, bank, memory
mode, recall settings, retention settings, and keyword patterns in that file.

The complete local configuration and deployment guide is available at
`~/.config/opencode/README-hindsight.md`.

## Features

- Auto-recall injects relevant memories into the model system context.
- Auto-retain stores tool results and session summaries.
- Keyword detection stores messages beginning with configured phrases such as
  `remember that ...` or `lembre que ...`.
- Retained memories receive project and feature tags.

## Runtime behavior

The plugin uses Hindsight's REST API because OpenCode plugins cannot invoke MCP
tools directly. Network failures are isolated to the plugin hook and do not
change the model request flow.
