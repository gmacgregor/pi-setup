# pi-setup

My personal [pi](https://pi.dev) configuration.

## Install

```bash
pi install git:github.com/gmacgregor/pi-setup
```

Use `pi remove git:github.com/gmacgregor/pi-setup` to uninstall, and `pi update --extensions` to pull future changes.

### Extensions (`extensions/`)

| File                  | What it does                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ask-user.ts`         | Drop-in replacement for the built-in `ask_user` tool where long option descriptions word-wrap instead of getting truncated.                                                                                                                      |
| `copilot-endpoint.ts` | Pins the `github-copilot` provider to the API host encoded in your Copilot token (`proxy-ep`). Without it, compaction/summarization requests fall back to the individual host and business/enterprise seats fail with `421 Misdirected Request`. |
| `context-cap.ts`      | Proactively triggers compaction once context usage crosses `min(maxTokens, maxPercent% of the model's context window)`, instead of relying on pi's flat `reserveTokens` default. Config persists to `~/.pi/agent/context-cap.json`.              |
| `minimal-footer.ts`   | Compact two-line footer: git branch + cwd on line 1, context-cap status + model/thinking level on line 2.                                                                                                                                        |
| `update-pi.ts`        | Adds an `/update` command that updates the pi CLI itself (via vp, bun, npm, brew, or native detection), with retry handling for transient network errors.                                                                                        |
| `whimsical.ts`        | Swaps the default "thinking..." spinner text for a rotating list of whimsical status messages.                                                                                                                                                   |
| `zsh-user-bash.ts`    | Runs bash commands the model executes through your actual zsh (`-fc`) instead of pi's default shell, so zsh-specific aliases/functions work.                                                                                                     |

### Themes (`themes/`)

- `github-dark-default.json`: a customized dark theme based on GitHub's palette.

## Companion packages

My full setup also uses a handful of third-party pi packages. Install with `pi install npm:<extension-name>`:

| Extension                                                                                | What it does                                                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`pi-skill-toggle`](https://pi.dev/packages/pi-skill-toggle)                             | Enable/disable skills from loading at startup                                            |
| [`pi-zed-shift-enter`](https://pi.dev/packages/pi-zed-shift-enter)                       | Fixes Shift+Enter newlines when pi runs in Zed's terminal                                |
| [`@gotgenes/pi-subagents`](https://pi.dev/packages/@gotgenes/pi-subagents)               | Adds in-process sub-agent support                                                        |
| [`@diegopetrucci/pi-quiet-tools`](https://pi.dev/packages/@diegopetrucci/pi-quiet-tools) | Visually compacts collapsed tool rows in the TUI                                         |
| [`pi-context-usage`](https://pi.dev/packages/pi-context-usage)                           | Context window usage visualization                                                       |
| [`@syzom/nopus`](https://github.com/Vistyy/nopus)                                        | Flags complex LLM responses and sends them back for a clearer rewrite                    |
| [`phxagents`](https://phxagents.dev/install/pi/)                                         | Elixir Phoenix plugin for Pi. Used on a project basis. See link for install instructions |

## Optional extras

These are personal preferences, not part of the package: copy what you want.

**AGENTS.md**: copy this repo's `AGENTS.md` to `~/.pi/agent/AGENTS.md` if you want the same global instructions pi loads at startup.

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
