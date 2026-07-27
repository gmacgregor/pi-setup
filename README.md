# pi-setup

My personal [pi](https://pi.dev) configuration: custom extensions and a theme,
bundled so I can install them on a new machine (or share them) in one shot.

This is a plain directory package — no `package.json`, no npm registry
involvement. pi discovers `extensions/` and `themes/` by convention.

## Install

```bash
pi install git:github.com/gmacgregor/pi-setup
```

Use `pi remove git:github.com/gmacgregor/pi-setup` to uninstall, and
`pi update --extensions` to pull future changes.

## What's included

### Extensions (`extensions/`)

| File | What it does |
|---|---|
| `ask-user.ts` | Drop-in replacement for the built-in `ask_user` tool where long option descriptions word-wrap instead of getting truncated. |
| `context-cap.ts` | Proactively triggers compaction once context usage crosses `min(maxTokens, maxPercent% of the model's context window)`, instead of relying on pi's flat `reserveTokens` default. Config persists to `~/.pi/agent/context-cap.json`. |
| `minimal-footer.ts` | Compact two-line footer: git branch + cwd on line 1, context-cap status + model/thinking level on line 2. |
| `update-pi.ts` | Adds an `/update` command that updates the pi CLI itself (via vp, bun, npm, brew, or native detection), with retry handling for transient network errors. |
| `whimsical.ts` | Swaps the default "thinking..." spinner text for a rotating list of whimsical status messages. |
| `zsh-user-bash.ts` | Runs bash commands the model executes through your actual zsh (`-fc`) instead of pi's default shell, so zsh-specific aliases/functions work. |

### Themes (`themes/`)

- `github-dark-default.json` — a customized dark theme based on GitHub's palette.

### AGENTS.md

`AGENTS.md` at the repo root is a copy of my global pi guidelines
(question-asking style, TypeScript conventions, etc). It is **not** loaded
automatically by installing this package — see [Optional extras](#optional-extras)
below if you want to use it.

## Companion packages (not bundled)

My full setup also uses a handful of third-party pi packages. These are
**not** bundled into pi-setup — install them yourself if you want them:

```bash
pi install npm:pi-skill-toggle          # Enable/disable skills from loading at startup
pi install npm:pi-zed-shift-enter       # Fixes Shift+Enter newlines when pi runs in Zed's terminal
pi install npm:@gotgenes/pi-subagents   # Adds in-process sub-agent support
pi install npm:@diegopetrucci/pi-quiet-tools  # Visually compacts collapsed tool rows in the TUI
pi install npm:pi-context-usage         # Context window usage visualization (also available via git:github.com/championswimmer/pi-context-usage)
```

## Optional extras

These are personal preferences, not part of the package — copy what you want.

**Settings** (`~/.pi/agent/settings.json`):

```json
{
  "theme": "github-dark-default",
  "defaultProvider": "github-copilot",
  "defaultModel": "claude-sonnet-5",
  "hideThinkingBlock": true,
  "defaultThinkingLevel": "medium"
}
```

Adjust `defaultProvider`/`defaultModel` to whatever you actually have access to.

**AGENTS.md**: copy this repo's `AGENTS.md` to `~/.pi/agent/AGENTS.md` if you
want the same global instructions pi loads at startup:

```bash
cp AGENTS.md ~/.pi/agent/AGENTS.md
```

## Skills

Not included yet — planned for a future update.
