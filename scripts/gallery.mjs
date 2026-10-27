// Renders every key and display style with sample numbers into docs/gallery.png (needs Playwright's Chromium).
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { creditAction } from "../src/actions/limits.js";
import { peakAction } from "../src/actions/peak.js";
import { DUAL_STYLES } from "../src/render/dual.js";
import { MODEL_STYLES } from "../src/render/models.js";
import { PERCENT_STYLES, renderPercent } from "../src/render/percent.js";
import { SERIES_STYLES } from "../src/render/series.js";
import { STATUS_STYLES } from "../src/render/status.js";
import { STREAK_STYLES } from "../src/render/streak.js";
import * as k from "./samples.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const { fiveView, hotView, weekView } = k;
const sections = [
	["5-годинний ліміт: 10 стилів (скільки лишилось)", PERCENT_STYLES.map((s) => [s.label, renderPercent(s.id, fiveView)])],
	["Той самий ліміт, коли витрачено багато (скільки використано)", PERCENT_STYLES.map((s) => [s.label, renderPercent(s.id, hotView)])],
	["Тижневий ліміт: усі моделі або окремо Fable, Opus, Sonnet, Haiku", [
		["Ring", renderPercent("ring", weekView)],
		["History", renderPercent("history", weekView)],
		["Pace", renderPercent("pace", weekView)],
		["Sonnet", renderPercent("bar", { ...weekView, label: "SONNET 7D", used: 12, show: "left" })],
		["Opus", renderPercent("segments", { ...weekView, label: "OPUS 7D", used: 33, show: "left" })],
		["Fable", renderPercent("ring", { ...weekView, label: "FABLE 7D", used: 2, show: "used" })],
	]],
	["Кредит за хмарні сесії (Cloud Credit): 8 стилів, скільки лишилось і скільки витрачено", [
		...creditAction.styles.map((s) => [s.label, k.creditKey(s.id)]),
		["Ring: spent", k.creditKey("ring", "used")],
		["Bar: spent", k.creditKey("bar", "used")],
	]],
	["Години пік: зараз пік, скоро, поза піком (24 години) і приклад з AM/PM", [
		...k.PEAK_MOMENTS.flatMap(([name, iso]) => peakAction.styles.map((st) => [`${name}: ${st.label}`, k.peakKey(st.id, iso)])),
		["PEAK: 12-hour", k.peakKey("timeline", "2026-10-20T15:00:00Z", "12")],
	]],
	["Кредит у Claude Console (API Credit) і витрати API за місяць", [
		...["number", "ring", "bar", "countdown"].map((style) => [`API Credit: ${style}`, k.apiCreditKey(style)]),
		["API Credit: spent", k.apiCreditKey("ring", "used")],
		["API Spend (no amount)", k.apiCredit({})],
	]],
	["Кеш, серія днів, запуск Claude Code", [
		...["ring", "number", "bar"].map((id) => [`Cache: ${id}`, k.cacheKey(id)]),
		...STREAK_STYLES.map((st) => [`Streak: ${st.label}`, k.streakKey(st.id)]),
		["Streak: not yet today", k.streakNotYetKey()],
		["Launch Claude Code", k.launchKey()],
	]],
	["Обидва ліміти на одній кнопці", DUAL_STYLES.map((s) => [s.label, k.dualKey(s.id)])],
	["Токени та вартість за цінами API", [
		...SERIES_STYLES.map((s) => [`Tokens: ${s.label}`, k.tokensKey(s.id)]),
		["Cost: 7 days", k.costWeekKey()],
		["Cost: today", k.costTodayKey()],
	]],
	["Моделі, контекст сесії, extra usage, стан Claude", [
		...MODEL_STYLES.map((s) => [`Models: ${s.label}`, k.modelsKey(s.id)]),
		["Context", k.contextKey()],
		["Extra usage", k.extraKey()],
		...STATUS_STYLES.map((s) => [`Status: ${s.label}`, k.statusKey(s.id)]),
		["Status: OK", k.statusOkKey()],
	]],
];

const tile = ([caption, svg]) =>
	`<figure><div class="key">${svg.replace('width="144" height="144"', 'width="104" height="104"')}</div><figcaption>${caption}</figcaption></figure>`;
const html = `<html><body><style>
	body { margin: 0; padding: 22px 26px 10px; background: #2d2d2d; color: #ddd; font: 13px Inter, Helvetica, Arial, sans-serif; width: 1240px; }
	h1 { font-size: 20px; margin: 0 0 4px; color: #fff; } p { margin: 0 0 18px; color: #9a9a9a; }
	h2 { font-size: 14px; font-weight: 600; margin: 16px 0 10px; color: #e5e5e5; }
	.row { display: flex; flex-wrap: wrap; gap: 14px 12px; }
	figure { margin: 0; width: 112px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
	.key { width: 104px; height: 104px; border-radius: 16px; overflow: hidden; box-shadow: 0 0 0 4px #161616, 0 0 0 5px #3a3a3a; }
	figcaption { font-size: 11.5px; color: #a0a0a0; text-align: center; }
</style>
<h1>Usage Meter for Claude: усі кнопки та стилі</h1>
<p>Приклад на тестових даних. На ваших кнопках будуть ваші цифри.</p>
${sections.map(([title, tiles]) => `<h2>${title}</h2><div class="row">${tiles.map(tile).join("")}</div>`).join("")}
</body></html>`;

const out = process.argv[2] ?? "docs/gallery.png";
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1292, height: 800 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
