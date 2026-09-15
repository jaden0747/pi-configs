# pi-configs

A curated [Pi](https://pi.dev) setup with an accurate VS Code Dark Modern/Dark+ theme, a dense two-row Powerline footer, GPT-5.6 Luna startup defaults, and six agent skills.

## Preview

```text
󰚩 gpt-5.6-luna  󰒲 high   ~/code/project   main 󰄬 
• 󰚩  󰍛 ████████████░░░░░░░░ 124k/272k (45.6%)   130k   8.2k  …
```

Colors and spacing are rendered by Pi; the text preview is intentionally approximate.

## Features

- Official VS Code Dark Modern UI colors and Dark+ syntax colors
- Terminal-adjusted contrast for borders and secondary text
- Full-width, two-row Powerline footer with colorful semantic segments
- Model anchored at the far left with a high-contrast thinking-level segment beside it; provider hidden
- Teal current-path segment, clean/dirty Git branch, and extension statuses
- Label-free icons for `READY`, `THINKING`, `TOOLS`, `WAITING`, and `ERROR` states
- Tool-specific icons and parallel-tool count without textual labels
- Seam-free 20-cell context bar with solid-cell rendering
- Context colors based on absolute usage:
  - green below 50k tokens
  - amber from 50k through 150k
  - red above 150k
- Input, output, cache read/write, latest cache-hit rate, cost, and thinking level
- Priority-based fallback for narrow terminals
- Matching calm pulse in the footer and editor border
- Curated skills: `caveman`, `grill-me`, `grill-with-docs`, `handoff`, `review`, and `zoom-out`

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

The installer copies the theme, extension, and curated skills into `~/.pi/agent` (or `$PI_CODING_AGENT_DIR`) and safely merges the active theme plus the `openai-codex/gpt-5.6-luna` startup default into `settings.json`. Existing destination files, skill directories, and settings are timestamp-backed up.

Restart Pi or run `/reload`.

### Linked development install

```bash
node setup.mjs --link
```

This symlinks the theme, extension, and each bundled skill directory so repository edits apply directly. On Windows, enable Developer Mode or run an elevated terminal if symlink creation is denied.

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
├── skills/
│   ├── caveman/
│   ├── grill-me/
│   ├── grill-with-docs/
│   ├── handoff/
│   ├── review/
│   └── zoom-out/
└── settings.json  # theme and GPT-5.6 Luna startup defaults merged
```

## Notes

- Home-relative paths use `/`; paths outside home use absolute paths with `/`.
- Errors remain visible until the next agent action.
- Auto-compaction is shown only when explicitly disabled in global or trusted project settings.
- The footer omits subscription-auth status by design.
- Setup installs or replaces the six bundled skill directories but does not remove unrelated skills.

## License

MIT
