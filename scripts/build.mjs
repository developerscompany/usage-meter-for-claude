// Bundles src/ and Elgato's Stream Deck SDK (with ws) into one CommonJS file that Stream Deck's Node.js 20 runs.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const out = "agency.rivo.usage-meter-for-claude.sdPlugin/bin";

// third-party code in the bundle, and where its license text is
const BUNDLED = [
	["@elgato/streamdeck", "node_modules/@elgato/streamdeck/LICENSE"],
	["@elgato/utils", "node_modules/@elgato/utils/LICENSE"],
	["ws", "node_modules/ws/LICENSE"],
];
const license = ([name, file]) => `${name}:\n${readFileSync(file, "utf8").trim()}`;

await build({
	entryPoints: ["src/plugin.js"],
	outfile: `${out}/plugin.js`,
	bundle: true,
	platform: "node",
	target: "node20",
	format: "cjs",
	// optional native speedups of ws; it falls back to plain JS without them
	external: ["bufferutil", "utf-8-validate"],
	banner: { js: `/*! Usage Meter for Claude, a Stream Deck plugin by Rivo Agency. Bundles, under these licenses:\n${BUNDLED.map(license).join("\n\n")}\n*/` },
	logLevel: "info",
});
writeFileSync(`${out}/package.json`, '{ "type": "commonjs" }\n');
