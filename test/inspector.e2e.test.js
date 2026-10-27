// Opens the property inspector in Chromium (Playwright) with a fake Stream Deck and checks what it sends.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, test } from "node:test";
import { WebSocketServer } from "ws";
import { PERCENT_STYLES, renderPercent } from "../src/render/percent.js";
import { toDataUrl } from "../src/render/svg.js";

const require = createRequire(import.meta.url);
let chromium;
try {
	({ chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright")));
} catch {
	chromium = null;
}
const skip = !chromium && "Playwright not installed";

const PREFIX = "agency.rivo.usage-meter-for-claude";
const PAGE = path.resolve("agency.rivo.usage-meter-for-claude.sdPlugin/ui/inspector.html");
const OUTPUT = path.resolve("test/output");

let server;
let browser;
const sockets = [];
const received = [];

async function open(actionId, settings, info = {}) {
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	await page.goto(`file://${PAGE}`);
	const actionInfo = { action: `${PREFIX}.${actionId}`, context: actionId, device: "dev-1", payload: { settings, coordinates: { column: 0, row: 0 } } };
	await page.evaluate(
		([port, action, uuid, app]) => window.connectElgatoStreamDeckSocket(port, uuid, "registerPropertyInspector", app, action),
		[server.address().port, JSON.stringify(actionInfo), `PI-${actionId}`, JSON.stringify(info)],
	);
	await waitFor((m) => m.event === "registerPropertyInspector" && m.uuid === `PI-${actionId}`);
	return page;
}

function waitFor(predicate, timeout = 5000) {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const poll = () => {
			const found = received.find(predicate);
			if (found) return resolve(found);
			if (Date.now() - started > timeout) return reject(new Error(`timeout; got ${JSON.stringify(received).slice(0, 500)}`));
			setTimeout(poll, 20);
		};
		poll();
	});
}

const sendStatus = (payload) => sockets.at(-1).send(JSON.stringify({ event: "sendToPropertyInspector", payload: { type: "status", ...payload } }));

before(async () => {
	if (!chromium) return;
	fs.mkdirSync(OUTPUT, { recursive: true });
	server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise((r) => server.once("listening", r));
	server.on("connection", (ws) => {
		sockets.push(ws);
		ws.on("message", (data) => received.push(JSON.parse(data.toString())));
	});
	browser = await chromium.launch();
});

after(async () => {
	await browser?.close();
	server?.close();
});

test("limit key: style picker with previews, account and thresholds", { skip }, async () => {
	const page = await open("limit5h", {});
	const ask = await waitFor((m) => m.event === "sendToPlugin" && m.context === "PI-limit5h");
	assert.deepEqual(ask.payload, { cmd: "status" });

	const now = Date.now();
	const view = { label: "5-HOUR", used: 25.4, show: "left", resetsAt: now + 10_020_000, now, windowMs: 18_000_000, warn: 50, danger: 80, series: [[now - 3_600_000, 10], [now, 25]] };
	const settings = { style: "ring", show: "left", press: "toggle", account: "", tag: "", warn: 50, danger: 80, refresh: 60 };
	sendStatus({
		action: "limit5h",
		settings,
		previews: PERCENT_STYLES.map((s) => ({ id: s.id, label: s.label, image: toDataUrl(renderPercent(s.id, view)) })),
		table: { columns: ["Now", "Resets"], rows: [["5-hour", "25% used · 75% left", "in 2h47m · 21:00"], ["Weekly", "52% used · 48% left", "in 2d13h · Thu 09:00"]] },
		info: [["Updated", "18:13:20"], ["Account", "Default (~/.claude)"]],
		error: null,
		accounts: [{ value: "", label: "Default (~/.claude)" }, { value: "~/.claude-work", label: "~/.claude-work" }],
	});
	await page.waitForSelector(".style");
	assert.equal(await page.locator(".style").count(), 10);
	assert.equal(await page.getAttribute(".style.selected", "data-style"), "ring");
	assert.deepEqual(await page.$$eval("#f-account option", (o) => o.map((x) => x.value)), ["", "~/.claude-work", "__other"]);
	await page.screenshot({ path: path.join(OUTPUT, "inspector-limit5h.png"), fullPage: true });

	received.length = 0;
	await page.click('.style[data-style="gauge"]');
	let saved = await waitFor((m) => m.event === "setSettings");
	assert.equal(saved.payload.style, "gauge");
	assert.equal(saved.payload.show, "left", "other settings are kept");
	assert.equal(await page.getAttribute(".style.selected", "data-style"), "gauge");

	received.length = 0;
	await page.selectOption("#f-account", "~/.claude-work");
	saved = await waitFor((m) => m.event === "setSettings");
	assert.equal(saved.payload.account, "~/.claude-work");

	received.length = 0;
	await page.selectOption("#f-account", "__other");
	assert.equal(await page.isVisible("#f-account-other"), true);
	await page.fill("#f-account-other", "~/work/.claude");
	await page.locator("#f-account-other").blur();
	saved = await waitFor((m) => m.event === "setSettings");
	assert.equal(saved.payload.account, "~/work/.claude");

	received.length = 0;
	await page.selectOption("#f-danger", "90");
	saved = await waitFor((m) => m.event === "setSettings");
	assert.equal(saved.payload.danger, 90);

	received.length = 0;
	await page.click("#rescan");
	assert.deepEqual((await waitFor((m) => m.event === "sendToPlugin")).payload, { cmd: "refresh" });
	await page.close();
});

test("token key: periods, count and the usage table", { skip }, async () => {
	const page = await open("usage", { periods: ["week", "month"], count: "all", periodIndex: 1 });
	await waitFor((m) => m.event === "sendToPlugin" && m.context === "PI-usage");
	sendStatus({
		action: "usage",
		settings: { periods: ["week", "month"], weekMode: "rolling", monthMode: "calendar", count: "all", paths: "", refresh: 60, periodIndex: 1, style: "classic" },
		previews: [],
		table: { columns: ["7 DAYS", "OCTOBER"], rows: [["On key", "432M", "1054M"], ["Requests", "6,120", "15,873"], ["API cost", "$212.40", "$498.10"]], highlight: 0 },
		info: [["Sources", "~/.claude/projects"], ["Scanned", "1,834 log files at 18:13:20 in 412 ms"]],
		error: null,
	});
	await page.waitForSelector("#details table");
	const cells = await page.$$eval("#details tr", (rows) => rows.map((r) => [...r.children].map((c) => c.textContent)));
	assert.deepEqual(cells[0], ["", "7 DAYS", "OCTOBER"]);
	assert.deepEqual(cells[1], ["On key", "432M", "1054M"]);
	assert.equal(await page.isHidden("#styles"), true, "no picker without previews");
	assert.equal(await page.isChecked('input[data-key="periods"][value="week"]'), true);
	assert.equal(await page.isChecked('input[data-key="periods"][value="today"]'), false);

	received.length = 0;
	await page.check('input[data-key="periods"][value="today"]');
	const saved = await waitFor((m) => m.event === "setSettings");
	assert.deepEqual(saved.payload.periods, ["today", "week", "month"]);
	assert.equal(saved.payload.periodIndex, 0);
	assert.equal(saved.payload.count, "all", "settings sent by the plugin are kept");

	await page.uncheck('input[data-key="periods"][value="today"]');
	await page.uncheck('input[data-key="periods"][value="week"]');
	await page.click('input[data-key="periods"][value="month"]');
	assert.equal(await page.isChecked('input[data-key="periods"][value="month"]'), true, "at least one period stays on");
	await page.screenshot({ path: path.join(OUTPUT, "inspector-usage.png"), fullPage: true });
	await page.close();
});

test("weekly key offers every model; status key its component list", { skip }, async () => {
	const weekly = await open("limit7d", {});
	assert.deepEqual(await weekly.$$eval("#f-scope option", (o) => o.map((x) => x.value)), ["all", "fable", "opus", "sonnet", "haiku"]);
	await weekly.close();
	const status = await open("status", {});
	assert.deepEqual(await status.$$eval("#f-component option", (o) => o.map((x) => x.value)), ["all", "code", "app", "api", "console", "cowork", "fable", "opus", "sonnet", "haiku"]);
	await status.close();
});

test("new keys: peak clock and warning, launch folder and terminal, a note under the numbers", { skip }, async () => {
	const peak = await open("peak", { clock: "auto", warn: 30 });
	assert.deepEqual(await peak.$$eval("#f-clock option", (o) => o.map((x) => x.value)), ["auto", "24", "12"]);
	assert.deepEqual(await peak.$$eval("#f-warn option", (o) => o.map((x) => x.value)), ["0", "15", "30", "60", "120"]);
	received.length = 0;
	await peak.selectOption("#f-clock", "12");
	const saved = await waitFor((m) => m.event === "setSettings");
	assert.equal(saved.payload.clock, "12");
	assert.equal(saved.payload.warn, 30, "other settings are kept");
	sendStatus({ settings: { clock: "12", warn: 30 }, table: { columns: ["Your time", "Starts"], rows: [["Tue, Oct 20", "5–11 AM", "now"]] }, note: "Since 6 May 2026 …" });
	await peak.waitForSelector("text=Since 6 May 2026");
	await peak.close();

	const launch = await open("launch", { folder: "~", command: "claude", terminal: "terminal" });
	assert.deepEqual(await launch.$$eval("#f-terminal option", (o) => o.map((x) => x.value)), ["terminal", "iterm", "cmd", "wt"]);
	received.length = 0;
	await launch.fill("#f-folder", "~/projects/app");
	await launch.locator("#f-folder").blur();
	const folder = await waitFor((m) => m.event === "setSettings");
	assert.equal(folder.payload.folder, "~/projects/app");
	await launch.close();

	const api = await open("apicredit", { amount: 0, granted: "", expires: "" });
	received.length = 0;
	await api.fill("#f-amount", "200");
	await api.locator("#f-amount").blur();
	const amount = await waitFor((m) => m.event === "setSettings");
	assert.equal(amount.payload.amount, 200, "a number, not text");
	assert.deepEqual(await api.$$eval("#f-press option", (o) => o.map((x) => x.value)), ["toggle", "style", "refresh", "open"]);
	assert.equal(await api.getAttribute("#f-granted", "placeholder"), "2026-10-18");

	// a date in another format is flagged and not saved
	received.length = 0;
	await api.fill("#f-granted", "18.10.2026");
	await api.locator("#f-granted").blur();
	assert.equal(await api.isVisible("#f-granted-error"), true);
	assert.equal(await api.getAttribute("#f-granted", "class"), "invalid");
	await new Promise((r) => setTimeout(r, 200));
	assert.equal(received.filter((m) => m.event === "setSettings").length, 0);
	await api.fill("#f-granted", "2026-10-18");
	await api.locator("#f-granted").blur();
	const granted = await waitFor((m) => m.event === "setSettings");
	assert.equal(granted.payload.granted, "2026-10-18");
	assert.equal(await api.isVisible("#f-granted-error"), false);
	await api.close();
});

test("help links open in the browser, and options follow the platform", { skip }, async () => {
	const mac = { application: { platform: "mac" } };
	const limit = await open("limit5h", {}, mac);
	assert.deepEqual(await limit.$$eval("#links a", (a) => a.map((x) => x.textContent)), ["Claude usage page", "Claude Code setup", "Email support"]);
	received.length = 0;
	await limit.click("text=Claude usage page");
	const opened = await waitFor((m) => m.event === "openUrl");
	assert.deepEqual(opened.payload, { url: "https://claude.ai/settings/usage" });
	assert.ok(limit.url().startsWith("file://"), "the panel itself does not navigate");
	await limit.close();

	const api = await open("apicredit", {}, mac);
	assert.deepEqual(await api.$$eval("#links a", (a) => a.map((x) => x.dataset.url)), [
		"https://platform.claude.com/settings/admin-keys",
		"https://platform.claude.com/settings/billing",
		"mailto:elgato@rivo.agency",
	]);
	await api.close();

	const onMac = await open("launch", { terminal: "terminal" }, mac);
	assert.deepEqual(await onMac.$$eval("#f-terminal option", (o) => o.map((x) => x.value)), ["terminal", "iterm"]);
	await onMac.close();
	const onWindows = await open("launch", { terminal: "cmd" }, { application: { platform: "windows" } });
	assert.deepEqual(await onWindows.$$eval("#f-terminal option", (o) => o.map((x) => x.value)), ["cmd", "wt"]);
	assert.equal(await onWindows.inputValue("#f-terminal"), "cmd");
	await onWindows.close();
});

test("a folded guide for adding another Claude account, for this platform; Launch keys pick an account too", { skip }, async () => {
	const mac = await open("limit5h", {}, { application: { platform: "mac" } });
	assert.equal(await mac.textContent(".guide summary"), "How to add another Claude account");
	assert.equal(await mac.isVisible(".guide code"), false, "folded until asked");
	await mac.click(".guide summary");
	assert.equal(await mac.textContent(".guide code"), "CLAUDE_CONFIG_DIR=~/.claude-work claude");
	await mac.click(".guide code");
	assert.equal(await mac.evaluate(() => window.getSelection().toString()), "CLAUDE_CONFIG_DIR=~/.claude-work claude", "a click selects the command");
	await mac.screenshot({ path: path.join(OUTPUT, "inspector-add-account.png"), fullPage: true });
	await mac.close();

	const windows = await open("limit7d", {}, { application: { platform: "windows" } });
	await windows.click(".guide summary");
	assert.equal(await windows.textContent(".guide code"), 'set "CLAUDE_CONFIG_DIR=%USERPROFILE%\\.claude-work" && claude');
	await windows.close();

	const launch = await open("launch", { account: "" }, { application: { platform: "mac" } });
	assert.deepEqual(await launch.$$eval("#f-account option", (o) => o.map((x) => x.textContent)), ["Default (~/.claude)", "Other folder…"]);
	sendStatus({ settings: { account: "~/.claude-work" }, accounts: [{ value: "", label: "Default (~/.claude) · you@example.com" }, { value: "~/.claude-work", label: "~/.claude-work · work@example.com" }] });
	await launch.waitForSelector("#f-account option[value='~/.claude-work']", { state: "attached" });
	assert.equal(await launch.inputValue("#f-account"), "~/.claude-work");
	assert.ok(await launch.isVisible("#f-tag"), "and a tag");
	await launch.close();
});
