# Contributing

Bug reports, ideas and pull requests are welcome.

## Before you open an issue

- Check the plugin's settings for the key in question: the panel under the settings shows what was found, when it was updated and any error.
- Attach the end of the plugin's log if something fails: `logs/plugin.log` in the plugin folder (on macOS, `~/Library/Application Support/com.elgato.StreamDeck/Plugins/agency.rivo.usage-meter-for-claude.sdPlugin/`). It never contains your login.

## Working on the code

You need Node.js 20 or later.

```sh
npm install
npm run build
npm test
```

`npm run pack` validates the manifest and builds the `.streamDeckPlugin` file in `dist/`; double-click it to try your build in Stream Deck. The settings panel tests and the image scripts need Playwright with Chromium installed globally (`npm install -g playwright`).

- Key images are SVG drawn by Qt's SVG Tiny renderer: no CSS, filters, `paint-order` or web fonts.
- The plugin must stay read-only towards logins and keys: it may read them, never refresh, store or log them.
- Add or update tests with your change; the end-to-end tests in `test/plugin.e2e.test.js` run the built plugin against a fake Stream Deck and fake APIs.
- Keep the code style of the file you change.

## Releasing

1. Raise the version in `agency.rivo.usage-meter-for-claude.sdPlugin/manifest.json` (four parts, such as `3.1.2.0`) and `package.json`, and add a section for it at the top of `CHANGELOG.md`.
2. Push to `main` and wait for CI to pass.
3. In the **Actions** tab, open **Release** and click **Run workflow**. It builds and tests the plugin, then publishes `v3.1.2` with the `.streamDeckPlugin` file and the notes from the changelog.
