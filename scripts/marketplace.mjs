// Marketplace listing images, drawn from the real key renderers with sample numbers (needs Playwright's Chromium):
// marketplace/thumbnail.png and gallery-1…5.png at 1920×960, and app-icon.png at 512×512.
// Peak hours are shown in US Eastern time on a 12-hour clock.
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PERCENT_STYLES, renderPercent } from "../src/render/percent.js";
import { toDataUrl } from "../src/render/svg.js";
import { pluginIcon } from "./brand.mjs";
import * as k from "./samples.mjs";

process.env.TZ = "America/New_York";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const OUT = "marketplace";
const PLUGIN = "agency.rivo.usage-meter-for-claude.sdPlugin";
const NAMES = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8")).Actions.map((a) => [a.UUID.split(".").pop(), a.Name]));

const PEAK = "2026-10-20T15:00:00Z";
const SOON = "2026-10-20T11:45:00Z";
const OFF_PEAK = "2026-10-20T19:30:00Z";

/** One key per action, in the order of the action list. */
const ALL_KEYS = [
	["limit5h", renderPercent("ring", k.fiveView)],
	["limit7d", renderPercent("gauge", { ...k.weekView, show: "left" })],
	["limits", k.dualKey("bars")],
	["peak", k.peakKey("badge", PEAK, "12")],
	["credit", k.creditKey("number")],
	["apicredit", k.apiCreditKey("ring")],
	["extra", k.extraKey()],
	["usage", k.tokensKey("classic")],
	["cost", k.costWeekKey()],
	["cache", k.cacheKey("ring")],
	["models", k.modelsKey("donut")],
	["context", k.contextKey()],
	["streak", k.streakKey("days")],
	["status", k.statusOkKey()],
	["launch", k.launchKey()],
];

const key = (svg, size) => `<div class="key" style="width:${size}px;height:${size}px">${svg.replace('width="144" height="144"', `width="${size}" height="${size}"`)}</div>`;
const tile = (svg, caption, size) => `<figure>${key(svg, size)}<figcaption>${caption}</figcaption></figure>`;
const grid = (tiles, columns, size, gap) => `<div class="grid" style="grid-template-columns:repeat(${columns},${size}px);column-gap:${gap}px">${tiles.join("")}</div>`;

const STYLE = `
	* { box-sizing: border-box; }
	body { margin: 0; width: 1920px; height: 960px; overflow: hidden; font-family: Inter, sans-serif; color: #fff;
		background: radial-gradient(1000px 640px at 72% 56%, rgba(48, 209, 88, 0.13), transparent 70%), linear-gradient(180deg, #151517 0%, #0b0b0c 100%); }
	.key { border-radius: 18%; overflow: hidden; background: #000; box-shadow: 0 0 0 3px #000, 0 0 0 4px #3a3a3c, 0 18px 40px rgba(0, 0, 0, 0.45); }
	.key svg { display: block; }
	.page { position: absolute; inset: 0; padding: 0 120px 70px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
	h1 { margin: 0; font-size: 66px; font-weight: 800; letter-spacing: -0.02em; text-align: center; }
	h1 em { font-style: normal; color: #30d158; }
	.sub { margin: 18px 0 0; max-width: 1340px; color: #a1a1a6; font-size: 29px; line-height: 1.4; text-align: center; }
	.grid { display: grid; row-gap: 34px; margin-top: 50px; }
	figure { margin: 0; display: flex; flex-direction: column; align-items: center; }
	figcaption { margin-top: 12px; color: #a1a1a6; font-size: 21px; font-weight: 500; white-space: nowrap; }
	.note { position: absolute; left: 120px; bottom: 44px; color: #6e6e73; font-size: 19px; }
`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}<div class="note">Unofficial. Not affiliated with Anthropic.</div></body></html>`;

const thumbnail = page(`
	<style>
		.hero { position: absolute; left: 120px; top: 50%; transform: translateY(-50%); width: 720px; }
		.hero h1 { text-align: left; font-size: 104px; line-height: 1.02; margin-top: 40px; }
		.hero .sub { text-align: left; font-size: 34px; margin-top: 28px; }
		.device { position: absolute; right: 112px; top: 50%; transform: translateY(-50%); padding: 34px; border-radius: 46px; border: 1px solid #2c2c2e;
			background: linear-gradient(180deg, #242427, #17171a); box-shadow: 0 50px 90px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.07); }
		.device .grid { margin: 0; gap: 20px; }
		.device .key { box-shadow: 0 0 0 2px #000, 0 0 0 3px #2c2c2e; }
	</style>
	<div class="hero">${pluginIcon(132)}<h1>Usage Meter<br><em>for Claude</em></h1><p class="sub">Plan limits, credits, tokens and costs, live on your Stream Deck.</p></div>
	<div class="device">${grid(ALL_KEYS.map(([, svg]) => key(svg, 146)), 5, 146, 20)}</div>
`);

const everyKey = page(`<div class="page">
	<h1>15 keys for <em>everything Claude</em></h1>
	<p class="sub">Limits, credits, peak hours, tokens, costs, models, context, streak and status.</p>
	${grid(ALL_KEYS.map(([id, svg]) => tile(svg, NAMES[id], 136)), 5, 136, 132)}
</div>`);

const limits = page(`<div class="page">
	<h1>Plan limits, <em>your way</em></h1>
	<p class="sub">5-hour and weekly limits for all models or just Fable, Opus, Sonnet or Haiku. Ten display styles show what's left or what's used, and when it resets.</p>
	${grid(
		[
			...PERCENT_STYLES.map((s, i) => tile(renderPercent(s.id, i < 7 ? k.fiveView : k.weekView), s.label, 174)),
			tile(renderPercent("bar", { ...k.weekView, label: "OPUS 7D", used: 33, show: "left" }), "Opus only", 174),
			tile(renderPercent("ring", { ...k.weekView, label: "SONNET 7D", used: 12, show: "left" }), "Sonnet only", 174),
			tile(renderPercent("battery", { ...k.weekView, label: "FABLE 7D", used: 2, show: "left" }), "Fable only", 174),
			tile(renderPercent("segments", { ...k.weekView, label: "HAIKU 7D", used: 64, show: "used" }), "Haiku only", 174),
		],
		7,
		174,
		50,
	)}
</div>`);

const credit = page(`<div class="page">
	<h1>Know <em>what's left</em></h1>
	<p class="sub">Cloud session credit, Claude Console credit and extra usage in dollars, and peak hours with a countdown in your own time zone.</p>
	${grid(
		[
			tile(k.creditKey("number"), "Cloud Credit", 170),
			tile(k.creditKey("bar", "used"), "Cloud Credit: spent", 170),
			tile(k.apiCreditKey("number"), "API Credit", 170),
			tile(k.apiCreditKey("countdown"), "API Credit: expiry", 170),
			tile(k.extraKey(), "Extra Usage", 170),
			tile(k.peakKey("badge", PEAK, "12"), "Peak now", 170),
			tile(k.peakKey("countdown", SOON, "12"), "Peak soon", 170),
			tile(k.peakKey("timeline", OFF_PEAK, "12"), "Off-peak", 170),
			tile(k.dualKey("rings"), "Both Limits", 170),
			tile(renderPercent("countdown", k.fiveView), "Reset timer", 170),
		],
		5,
		170,
		110,
	)}
</div>`);

const code = page(`<div class="page">
	<h1>Claude Code <em>at a glance</em></h1>
	<p class="sub">Tokens and API-equivalent cost by day, week or month, cache hits, model mix, session context, your daily streak and service status.</p>
	${grid(
		[
			tile(k.tokensKey("classic"), "Tokens: month", 170),
			tile(k.costWeekKey(), "Cost: 7 days", 170),
			tile(k.costTodayKey(), "Cost: today", 170),
			tile(k.cacheKey("ring"), "Cache Hits", 170),
			tile(k.modelsKey("donut"), "Model Mix", 170),
			tile(k.modelsKey("bars"), "Model Mix: bars", 170),
			tile(k.contextKey(), "Session Context", 170),
			tile(k.streakKey("days"), "Streak", 170),
			tile(k.streakKey("calendar"), "Streak: calendar", 170),
			tile(k.statusKey("badge"), "Claude Status", 170),
			tile(k.statusOkKey(), "Status: all good", 170),
			tile(k.launchKey(), "Launch Claude Code", 170),
		],
		6,
		170,
		76,
	)}
</div>`);

/** The settings panel of a 5-hour limit key, as Stream Deck shows it, with sample numbers. */
async function settingsShot(browser) {
	const tab = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	await tab.goto(`file://${path.resolve(PLUGIN, "ui/inspector.html")}`);
	const actionInfo = { action: `${PLUGIN.replace(".sdPlugin", "")}.limit5h`, context: "k", payload: { settings: { style: "ring", show: "left", press: "toggle", account: "", warn: 50, danger: 80, refresh: 60 } } };
	const previews = PERCENT_STYLES.map((s) => ({ id: s.id, label: s.label, image: toDataUrl(renderPercent(s.id, k.fiveView)) }));
	const status = {
		table: { columns: ["Now", "Resets"], rows: [["5-hour", "25% used · 75% left", "in 2h47m · 5:00 PM"], ["Weekly", "52% used · 48% left", "in 2d13h · Thu 9:00 AM"]] },
		info: [["Updated", "2:13 PM"], ["Account", "Default (~/.claude)"]],
	};
	await tab.evaluate(
		([action, app, list, details]) => {
			window.connectElgatoStreamDeckSocket(9, "PI", "registerPropertyInspector", app, action); // no Stream Deck to connect to here
			showPreviews(list);
			showDetails(details);
			fill();
		},
		[JSON.stringify(actionInfo), JSON.stringify({ application: { platform: "mac" } }), previews, status],
	);
	const shot = await tab.screenshot({ type: "png", fullPage: true });
	await tab.close();
	return `data:image/png;base64,${shot.toString("base64")}`;
}

const settings = (shot) =>
	page(`
	<style>
		.left { position: absolute; left: 120px; top: 50%; transform: translateY(-50%); width: 860px; }
		.left h1 { text-align: left; }
		.left .sub { text-align: left; }
		ul { margin: 44px 0 0; padding: 0; list-style: none; }
		li { position: relative; padding-left: 46px; margin: 0 0 24px; font-size: 31px; color: #e5e5ea; line-height: 1.35; }
		li::before { content: ""; position: absolute; left: 0; top: 13px; width: 18px; height: 18px; border-radius: 50%; background: #30d158; }
		.panel { position: absolute; right: 150px; top: 70px; width: 546px; height: 820px; overflow: hidden; border-radius: 22px; border: 1px solid #3a3a3c;
			box-shadow: 0 40px 90px rgba(0, 0, 0, 0.6); background: #2d2d2d; }
		.panel img { width: 546px; display: block; }
		.panel::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 120px; background: linear-gradient(rgba(45, 45, 45, 0), #2d2d2d 85%); }
	</style>
	<div class="left">
		<h1>Set up <em>in a click</em></h1>
		<p class="sub">Every key has its own settings panel in Stream Deck.</p>
		<ul>
			<li>Live previews of every display style</li>
			<li>What's left or what's used, with your own yellow and red levels</li>
			<li>Several Claude Code accounts, each with a short tag</li>
			<li>Clear messages on the key, and help links in its settings</li>
		</ul>
	</div>
	<div class="panel"><img src="${shot}" alt=""></div>
`);

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const shoot = async (file, html, width = 1920, height = 960) => {
	const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
	await tab.setContent(html);
	await tab.evaluate(() => document.fonts.ready);
	await tab.screenshot({ path: path.join(OUT, file), omitBackground: file === "app-icon.png" });
	await tab.close();
	console.log("wrote", path.join(OUT, file));
};
await shoot("thumbnail.png", thumbnail);
await shoot("gallery-1.png", everyKey);
await shoot("gallery-2.png", limits);
await shoot("gallery-3.png", credit);
await shoot("gallery-4.png", code);
await shoot("gallery-5.png", settings(await settingsShot(browser)));
await shoot("app-icon.png", `<html><body style="margin:0;background:transparent">${pluginIcon(512)}</body></html>`, 512, 512);
await browser.close();
