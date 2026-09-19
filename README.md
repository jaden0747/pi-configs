# pi-configs

A curated [Pi](https://pi.dev) setup with an accurate VS Code Dark Modern/Dark+ theme, a calm two-row footer, GPT-5.6 Luna startup defaults, six agent skills, and curated extensions.

## Preview

```text
 ~/code/project    main 󰄬  • THINKING
󰚩 gpt-5.6-luna  󰧑 high   󰍛 ████████████░░░░░░░░ 124k/272k (45.6%)    130k   8.2k   󰄔 $0.42
```

Colors and spacing are rendered by Pi; the text preview is intentionally approximate.

## Features

- Official VS Code Dark Modern UI colors and Dark+ syntax colors
- Terminal-adjusted contrast for borders and secondary text
- Full-width, two-row footer with flat dark surfaces and subtle separators
- Activity, model, thinking level, path, Git, context, cache, and cost labels each have distinct readable text colors
- Activity anchored at the far right so activity changes do not move the rest of the footer; provider hidden
- Muted current path, semantic Git branch state, and extension statuses
- Visible `READY`, `THINKING`, `TOOLS`, `WAITING`, and `ERROR` activity labels
- Tool-specific activity icons and parallel-tool count
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
- A Nerd Font with Codicon glyphs
- A truecolor terminal is recommended

## Install

```bash
git clone https://github.com/jaden0747/pi-configs.git
cd pi-configs
node setup.mjs
```

The installer copies the theme, extension, and curated skills into `~/.pi/agent` (or `$PI_CODING_AGENT_DIR`) and safely merges the active theme, the `openai-codex/gpt-5.6-luna` startup default, and the managed Pi packages into `settings.json`. It also removes retired repository-managed packages (`pi-web-access` and `pi-ponytail`) by invoking `pi remove`, so running setup after syncing this repository cleans them up on another machine. Existing destination files, skill directories, and settings are replaced without creating backups.

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
└── settings.json  # theme, packages, and GPT-5.6 Luna startup defaults merged
```

## Notes

- Home-relative paths use `/`; paths outside home use absolute paths with `/`.
- Errors remain visible until the next agent action.
- Auto-compaction is shown only when explicitly disabled in global or trusted project settings.
- The footer omits subscription-auth status by design.
- Setup installs or replaces the six bundled skill directories but does not remove unrelated skills.
- Setup adds `pi-subagents`, `@juicesharp/rpiv-ask-user-question`, and `@juicesharp/rpiv-todo` to `settings.json` without removing unrelated packages.
- Setup prunes only the repository-managed retired packages: `pi-web-access` and `pi-ponytail`.

## License

MIT
