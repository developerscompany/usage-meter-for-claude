# Privacy

Usage Meter for Claude is a Stream Deck plugin by Rivo Agency. It runs entirely on your computer.

## What it reads on your computer

- **Your Claude Code login**, from the macOS Keychain or from `~/.claude/.credentials.json`, only to ask Anthropic for your plan's usage limits and credit. It is only read: never refreshed, copied, written to a log, shown in settings or shared.
- **Which account is signed in**, the email in Claude Code's config file (`~/.claude.json`), to label accounts in the settings.
- **Claude Code's logs** (`~/.claude/projects` and `~/.claude-*` profile folders), to count tokens and estimate costs. They never leave your computer.
- **A Claude Console Admin API key**, only if you set up the API Credit key and store the key yourself, in the macOS Keychain or in a file in the plugin's data folder. It is only read.

## Where it connects

- **api.anthropic.com**: your plan's usage limits and credit, and, for the API Credit key, your organization's cost report.
- **status.claude.com**: Claude's public service status.

Nothing else. The plugin has no analytics, no telemetry and no servers of its own, and Rivo Agency receives no data from it.

## What it stores

The latest numbers and a short history for the History display style, in the plugin's data folder: `~/Library/Application Support/agency.rivo.usage-meter-for-claude` on macOS, `%APPDATA%\agency.rivo.usage-meter-for-claude` on Windows. Uninstall the plugin and delete that folder to remove them.

## Contact

elgato@rivo.agency
