# Usage Meter for Claude: Privacy Policy

Last updated: October 21, 2026

Usage Meter for Claude is a Stream Deck plugin by Rivo Agency. It runs entirely on your computer.

## What the plugin reads on your computer

- **Your Claude Code sign-in**, from the macOS Keychain or from `~/.claude/.credentials.json`, only to ask Anthropic for your plan's usage limits and credit. The plugin only reads it: it never changes it, copies it elsewhere, writes it to a log or shares it.
- **Claude Code's local logs** (`~/.claude/projects`), to count tokens and estimate costs. They never leave your computer.
- **A Claude Console Admin API key**, only if you set up the API Credit key and store the key yourself, in the macOS Keychain or in a file in the plugin's data folder. It is only read.

## Where the plugin connects

- **api.anthropic.com**: your plan's usage limits and credit and, for the API Credit key, your organization's cost report.
- **status.claude.com**: Claude's public service status.

Nothing else. The plugin has no analytics, no telemetry and no servers of its own, and Rivo Agency receives no data from it.

## What the plugin stores

The latest numbers and a short history (for the History display style), in the plugin's data folder on your computer: `~/Library/Application Support/agency.rivo.usage-meter-for-claude` on macOS, `%APPDATA%\agency.rivo.usage-meter-for-claude` on Windows. Uninstall the plugin and delete that folder to remove them.

## Contact

elgato@rivo.agency
