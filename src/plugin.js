// Usage Meter for Claude, a Stream Deck plugin: plan limits, peak hours, credit, tokens, API cost, cache, model mix,
// session context, streak, service status, and a key that starts Claude Code.
// Short press does what the key's settings say (next period, used/left, ...). Holding a key refreshes it now.
import { execFile } from "node:child_process";
import path from "node:path";
import { cacheAction, streakAction } from "./actions/activity.js";
import { apiCreditAction } from "./actions/console.js";
import { contextAction, modelsAction, statusAction } from "./actions/insights.js";
import { launchAction } from "./actions/launch.js";
import { peakAction } from "./actions/peak.js";
import { detectClock } from "./clock.js";
import { ConsoleService } from "./console.js";
import { bothLimitsAction, creditAction, extraAction, fiveHourAction, weeklyAction } from "./actions/limits.js";
import { costAction, tokensAction } from "./actions/series.js";
import { LimitsService, dataDir } from "./limits.js";
import { createLogger } from "./log.js";
import { toDataUrl } from "./render/svg.js";
import { StatusService } from "./status.js";
import { connectStreamDeck } from "./streamdeck.js";
import { UsageIndex, resolveRoots } from "./usage-index.js";

const ACTIONS = new Map(
	[
		tokensAction,
		costAction,
		cacheAction,
		fiveHourAction,
		weeklyAction,
		bothLimitsAction,
		peakAction,
		creditAction,
		apiCreditAction,
		extraAction,
		modelsAction,
		contextAction,
		streakAction,
		statusAction,
		launchAction,
	].map((a) => [a.uuid, a]),
);
const LONG_PRESS_MS = 600;
const TICK_MS = 5_000;

const pluginDir = path.dirname(path.dirname(path.resolve(process.argv[1] ?? ".")));
const log = createLogger(path.join(pluginDir, "logs"));
process.on("uncaughtException", (err) => log.error(`uncaught: ${err?.stack ?? err}`));
process.on("unhandledRejection", (err) => log.error(`unhandled: ${err?.stack ?? err}`));

const sd = connectStreamDeck(log);
// times on keys and in the settings: AM/PM or 24 hours, as the computer's region uses
detectClock().then(
	(twelve) => log.info(`clock: ${twelve ? "12" : "24"}-hour`),
	(err) => log.warn(`clock: ${err?.message ?? err}`),
);

/** Visible keys by context. */
const keys = new Map();
/** Data sources shared by keys: "usage:<folders>", "limits:<account>", "console:<from day>", "status:". */
const services = new Map();

function service(kind, arg = "") {
	const id = `${kind}:${arg}`;
	let svc = services.get(id);
	if (!svc) {
		// "Auto" limits look for a login in every folder that has Claude Code logs.
		const profileDirs = () => resolveRoots("").map((root) => path.dirname(root));
		const impl =
			kind === "usage"
				? new UsageIndex(() => resolveRoots(arg))
				: kind === "limits"
					? new LimitsService(arg, { log, dir: dataDir(), profileDirs })
					: kind === "console"
						? new ConsoleService({ from: arg, log, dir: dataDir() })
						: new StatusService({ log });
		svc = { id, kind, arg, impl, lastRun: 0, error: null, loggedError: null };
		services.set(id, svc);
	}
	return svc;
}

const usersOf = (svc) => [...keys.values()].filter((key) => key.services.includes(svc));

function attach(key) {
	const needs = key.action.needs(key.settings);
	key.services = [];
	if (needs.usage !== undefined) key.services.push(service("usage", needs.usage));
	if (needs.limits !== undefined) key.services.push(service("limits", needs.limits));
	if (needs.console !== undefined) key.services.push(service("console", needs.console));
	if (needs.status) key.services.push(service("status"));
	for (const [id, svc] of services) if (!usersOf(svc).length) services.delete(id);
}

function contextOf(key) {
	const ctx = { settings: key.settings, now: new Date() };
	for (const svc of key.services) {
		if (svc.kind === "usage") {
			ctx.usage = svc.impl;
			ctx.usageError = svc.error;
		} else if (svc.kind === "limits") ctx.limits = svc.impl;
		else if (svc.kind === "console") ctx.console = svc.impl;
		else ctx.status = svc.impl;
	}
	return ctx;
}

function logChange(svc, error) {
	const text = error ? error.message ?? String(error) : null;
	if (text === svc.loggedError) return;
	svc.loggedError = text;
	if (text) log.warn(`${svc.id}: ${text}`);
	else log.info(`${svc.id}: ok`);
}

async function refresh(svc, force = false) {
	const users = usersOf(svc);
	if (!users.length) return;
	const interval = Math.min(...users.map((key) => key.action.refreshSeconds(key.settings))) * 1000;
	if (!force && Date.now() - svc.lastRun < interval) return;
	svc.lastRun = Date.now();

	try {
		if (svc.kind === "usage") {
			const first = !svc.impl.lastScan;
			const scan = await svc.impl.refresh();
			svc.error = null;
			if (first || scan.ms > 2000) log.info(`scan: ${svc.impl.roots.join(", ") || "no folders"}; ${scan.files} files, ${(scan.bytes / 1e6).toFixed(1)} MB in ${scan.ms} ms`);
		} else {
			await svc.impl.refresh(force);
			logChange(svc, svc.impl.error);
		}
	} catch (err) {
		svc.error = String(err?.message ?? err);
		log.error(`${svc.id} failed: ${err?.stack ?? err}`);
	}
	for (const key of usersOf(svc)) {
		draw(key);
		if (key.inspector) sendStatus(key);
	}
}

function draw(key) {
	let image;
	try {
		image = key.action.render(contextOf(key));
	} catch (err) {
		log.error(`render ${key.action.id}: ${err?.stack ?? err}`);
		return;
	}
	if (image === key.svg) return;
	key.svg = image;
	sd.setImage(key.context, toDataUrl(image));
}

function sendStatus(key) {
	const ctx = contextOf(key);
	let details = {};
	try {
		details = key.action.info(ctx) ?? {};
	} catch (err) {
		log.error(`info ${key.action.id}: ${err?.stack ?? err}`);
	}
	const previews = [];
	for (const style of key.action.styles) {
		try {
			previews.push({ id: style.id, label: style.label, image: toDataUrl(key.action.render(ctx, style.id)) });
		} catch (err) {
			log.error(`preview ${key.action.id}/${style.id}: ${err?.stack ?? err}`);
		}
	}
	sd.sendToPropertyInspector(key.context, key.action.uuid, { type: "status", action: key.action.id, settings: key.settings, previews, ...details });
}

function hasError(key) {
	return key.services.some((svc) => svc.error || (svc.kind !== "usage" && svc.impl.error));
}

async function rescan(key, { feedback = true } = {}) {
	await Promise.all(key.services.map((svc) => refresh(svc, true)));
	if (!feedback) return;
	if (hasError(key)) sd.showAlert(key.context);
	else sd.showOk(key.context);
}

function press(key) {
	const result = key.action.press(contextOf(key));
	if (result === "save") {
		sd.setSettings(key.context, key.settings);
		draw(key);
		if (key.inspector) sendStatus(key);
	} else if (result === "refresh") {
		rescan(key);
	} else if (result?.url) {
		sd.openUrl(result.url);
	} else if (result?.exec) {
		const { file, args, env } = result.exec;
		execFile(file, args, { timeout: 15_000, windowsHide: true, ...(env ? { env } : {}) }, (err) => {
			if (err) {
				log.warn(`${key.action.id}: could not start ${path.basename(file)}: ${err.message}`);
				sd.showAlert(key.context);
			} else sd.showOk(key.context);
		});
	}
}

sd.on("willAppear", ({ action, context, payload }) => {
	const handler = ACTIONS.get(action);
	if (!handler) return;
	const key = { context, action: handler, settings: handler.normalize(payload?.settings), services: [], svg: "", timer: null, held: false, inspector: false };
	keys.set(context, key);
	attach(key);
	draw(key);
	for (const svc of key.services) refresh(svc);
});

sd.on("willDisappear", ({ context }) => {
	const key = keys.get(context);
	if (!key) return;
	clearTimeout(key.timer);
	keys.delete(context);
	for (const [id, svc] of services) if (!usersOf(svc).length) services.delete(id);
});

sd.on("keyDown", ({ context }) => {
	const key = keys.get(context);
	if (!key) return;
	key.held = false;
	clearTimeout(key.timer);
	key.timer = setTimeout(() => {
		key.held = true;
		rescan(key);
	}, LONG_PRESS_MS);
});

sd.on("keyUp", ({ context }) => {
	const key = keys.get(context);
	if (!key) return;
	clearTimeout(key.timer);
	if (!key.held) press(key);
});

sd.on("didReceiveSettings", ({ context, payload }) => {
	const key = keys.get(context);
	if (!key) return;
	key.settings = key.action.normalize(payload?.settings);
	const before = key.services;
	attach(key);
	for (const svc of key.services) if (!before.includes(svc)) refresh(svc);
	draw(key);
	if (key.inspector) sendStatus(key);
});

sd.on("propertyInspectorDidAppear", ({ context }) => {
	const key = keys.get(context);
	if (!key) return;
	key.inspector = true;
	sendStatus(key);
});

sd.on("propertyInspectorDidDisappear", ({ context }) => {
	const key = keys.get(context);
	if (key) key.inspector = false;
});

sd.on("sendToPlugin", async ({ context, payload }) => {
	const key = keys.get(context);
	if (!key) return;
	if (payload?.cmd === "refresh") await rescan(key, { feedback: false });
	sendStatus(key);
});

sd.on("systemDidWakeUp", () => {
	for (const svc of services.values()) refresh(svc, true);
});

setInterval(() => {
	for (const svc of services.values()) refresh(svc);
	// countdowns and "minutes ago" change without new data
	for (const key of keys.values()) draw(key);
}, TICK_MS);
