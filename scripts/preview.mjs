// Renders the key images captured by the end-to-end test (test/output/*.svg) into one PNG sheet.
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const dir = "test/output";
const names = ["week", "month", "today", "week-io", "loading"].filter((n) => fs.existsSync(path.join(dir, `${n}.svg`)));
const captions = { week: "7 days", month: "this month (after a press)", today: "today", "week-io": "7 days, input+output only", loading: "first scan" };
const out = process.argv[2] ?? path.join(dir, "preview.png");

const tile = (name, size) => {
	const svg = fs.readFileSync(path.join(dir, `${name}.svg`), "utf8").replace('width="144" height="144"', `width="${size}" height="${size}"`);
	return `<div class="key" style="width:${size}px;height:${size}px">${svg}</div>`;
};

const html = `<html><body style="margin:0;background:#2d2d2d;font:13px -apple-system,Helvetica,Arial,sans-serif;color:#aaa">
<style>
	.row { display:flex; gap:22px; padding:22px 26px 6px; align-items:flex-end; }
	.cell { display:flex; flex-direction:column; align-items:center; gap:8px; width:150px; text-align:center; }
	.key { border-radius:14px; overflow:hidden; box-shadow:0 0 0 4px #1b1b1b, 0 0 0 5px #3a3a3a; }
	h4 { margin:16px 26px 0; font-weight:600; color:#ddd; }
</style>
<h4>Actual Stream Deck XL key size (96 px)</h4>
<div class="row">${names.map((n) => `<div class="cell">${tile(n, 96)}<span>${captions[n]}</span></div>`).join("")}</div>
<h4>Enlarged (144 px)</h4>
<div class="row" style="padding-bottom:24px">${names.map((n) => `<div class="cell">${tile(n, 144)}</div>`).join("")}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setViewportSize({ width: 26 * 2 + names.length * 172, height: 470 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
