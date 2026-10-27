// Helpers shared by the key actions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { twelveHour } from "../clock.js";
import { accountEmail } from "../login.js";
import { PERIOD_IDS, getPeriod } from "../periods.js";

export const PREFIX = "agency.rivo.usage-meter-for-claude";

export const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export function clampNumber(value, min, max, fallback) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const styleIds = (styles) => styles.map((s) => s.id);

/** Periods a key cycles through on press, and how weeks and months are counted. */
export function normalizePeriods(s, fallback) {
	const periods = Array.isArray(s.periods) ? PERIOD_IDS.filter((id) => s.periods.includes(id)) : [];
	s.periods = periods.length ? periods : [...fallback];
	s.weekMode = pick(s.weekMode, ["rolling", "calendar"], "rolling");
	s.monthMode = pick(s.monthMode, ["calendar", "rolling"], "calendar");
	const i = Number(s.periodIndex);
	s.periodIndex = Number.isInteger(i) && i >= 0 ? i % s.periods.length : 0;
	s.paths = typeof s.paths === "string" ? s.paths.trim() : "";
}

export const currentPeriod = (s, now) => getPeriod(s.periods[s.periodIndex], s, now);

/** Short press on a period key: next period, or a rescan when there is only one. */
export function nextPeriod(s) {
	if (s.periods.length < 2) return "refresh";
	s.periodIndex = (s.periodIndex + 1) % s.periods.length;
	return "save";
}

/** Settings shared by the plan-limit keys. */
export function normalizeLimitSettings(s, styles) {
	s.style = pick(s.style, styleIds(styles), styles[0].id);
	s.show = pick(s.show, ["left", "used"], "left");
	s.press = pick(s.press, ["toggle", "style", "refresh", "open"], "toggle");
	s.account = typeof s.account === "string" ? s.account.trim() : "";
	s.tag = typeof s.tag === "string" ? s.tag.trim().slice(0, 3) : "";
	s.warn = clampNumber(s.warn, 1, 100, 50);
	s.danger = clampNumber(s.danger, s.warn, 100, 80);
	s.refresh = clampNumber(s.refresh, 30, 3600, 60);
	return s;
}

export const USAGE_PAGE = "https://claude.ai/settings/usage";

/** Short press on a limit key, by its "On press" setting. */
export function limitPress(s, styles) {
	if (s.press === "toggle") {
		s.show = s.show === "left" ? "used" : "left";
		return "save";
	}
	if (s.press === "style") {
		const ids = styleIds(styles);
		s.style = ids[(ids.indexOf(s.style) + 1) % ids.length];
		return "save";
	}
	if (s.press === "open") return { url: USAGE_PAGE };
	return "refresh";
}

/** What a limit key says when it has no numbers: [message, what to do]. */
export const LIMIT_ERRORS = {
	signin: ["no Claude login", "run claude"],
	expired: ["login expired", "run claude"],
	auth: ["token refused", "see settings"],
	rate: ["rate limited", "retrying"],
	network: ["offline", "retrying"],
	http: ["API error", "retrying"],
};

export function tildify(p, home = os.homedir()) {
	return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

/** Claude Code profile folders in the home folder besides ~/.claude, such as ~/.claude-work. */
function profileFolders(home) {
	try {
		return fs
			.readdirSync(home, { withFileTypes: true })
			.filter((ent) => ent.isDirectory() && /^\.claude[-_.]./i.test(ent.name))
			.map((ent) => `~/${ent.name}`)
			.sort();
	} catch {
		return []; // unreadable home: default only
	}
}

/** An account picker entry, with the email signed in to that profile when Claude Code recorded it. */
function profileOption(value, label, home) {
	const email = accountEmail(value, home);
	return { value, label: email ? `${label} · ${email}` : label };
}

/** Claude Code profiles for a limit key's account picker. */
export function detectProfiles(home = os.homedir()) {
	return [{ value: "", label: "Auto (freshest login)" }, profileOption("~/.claude", "~/.claude", home), ...profileFolders(home).map((f) => profileOption(f, f, home))];
}

/** The same for a Launch key, where the default is Claude Code as Terminal starts it, without CLAUDE_CONFIG_DIR. */
export function launchProfiles(home = os.homedir()) {
	return [profileOption("", "Default (~/.claude)", home), ...profileFolders(home).map((f) => profileOption(f, f, home))];
}

export function clock(ms) {
	return ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: twelveHour() }) : "—";
}

export function when(ms, now) {
	if (!ms) return "—";
	const d = new Date(ms);
	const sameDay = d.toDateString() === new Date(now).toDateString();
	const hour12 = twelveHour();
	if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12 });
	if (Math.abs(ms - now) < 6 * 86_400_000) return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", hour12 });
	return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12 });
}

/** "Nov 4" */
export const monthDay = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
