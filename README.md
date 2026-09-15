# pi-configs

A colorful VS Code Dark Modern makeover for [Pi](https://pi.dev): an accurate Dark Modern/Dark+ theme, a dense two-row Powerline footer, and GPT-5.6 Luna startup defaults.

## Preview

```text
󰚩 gpt-5.6-luna   ~/code/project   main 󰄬  󰢻 Refactor authentication 
• 󰚩 THINKING  󰍛 CTX ████████████░░░░░░░░ 124k/272k (45.6%)   IN 130k   OUT 8.2k  …
```

Colors and spacing are rendered by Pi; the text preview is intentionally approximate.

## Features

- Official VS Code Dark Modern UI colors and Dark+ syntax colors
- Terminal-adjusted contrast for borders and secondary text
- Full-width, two-row Powerline footer with colorful semantic segments
- Model anchored at the far left of the first row, with provider hidden
- Path, clean/dirty Git branch, session title, and extension statuses
- Icon-rich `READY`, `THINKING`, `TOOLS`, `WAITING`, and `ERROR` activity states
- Tool-specific icons, current tool name, and parallel-tool count
- 20-cell context bar with eighth-block precision
- Context colors based on absolute usage:
  - green below 50k tokens
  - amber from 50k through 150k
  - red above 150k
- Input, output, cache read/write, latest cache-hit rate, cost, and thinking level
- Priority-based fallback for narrow terminals
- Matching calm pulse in the footer and editor border

## Requirements

- Pi with extension and custom-theme support
- Node.js 20 or newer
- A Nerd Font with Powerline and Codicon glyphs
- A truecolor terminal is recommended

## Install

```bash
git clone https://github.com/jaden0747/pi-configs.git
cd pi-configs
node setup.mjs
```

The installer copies files into `~/.pi/agent` (or `$PI_CODING_AGENT_DIR`) and safely merges the active theme plus the `openai-codex/gpt-5.6-luna` startup default into `settings.json`. Existing destination files and settings are timestamp-backed up.

Restart Pi or run `/reload`.

### Linked development install

```bash
node setup.mjs --link
```

This symlinks the theme and extension so repository edits apply directly. On Windows, enable Developer Mode or run an elevated terminal if symlink creation is denied.

### Preview changes

```bash
node setup.mjs --dry-run
node setup.mjs --link --dry-run
```

## Installed files

```text
~/.pi/agent/
├── extensions/
│   └── vscode-powerline.ts
├── themes/
│   └── vscode-dark-modern.json
└── settings.json  # theme and GPT-5.6 Luna startup defaults merged
```

## Notes

- Home-relative paths use `/`; paths outside home use absolute paths with `/`.
- Session titles fall back to the first user prompt.
- Errors remain visible until the next agent action.
- Auto-compaction is shown only when explicitly disabled in global or trusted project settings.
- The footer omits subscription-auth status by design.

## License

MIT
