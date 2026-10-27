// Cache and Streak keys, from the local Claude Code logs: how much of the input came from the prompt
// cache (and what that saved at API prices), and how many days in a row Claude Code was used.
import { formatMoney } from "../format.js";
import { getPeriod } from "../periods.js";
import { priceFor } from "../pricing.js";
import { PERCENT_STYLES, renderPercent } from "../render/percent.js";
import { STREAK_STYLES, renderStreak } from "../render/streak.js";
import { COLORS, messageKey } from "../render/svg.js";
import { addDays, dayKey, startOfDay } from "../usage-index.js";
import { PREFIX, clampNumber, clock, currentPeriod, nextPeriod, normalizePeriods, pick, styleIds, tildify } from "./common.js";

/** Share of prompt tokens read from the cache, and what those reads saved against the input price. */
export function cacheStats(index, days) {
	let read = 0;
	let prompt = 0;
	let saved = 0;
	for (const [model, t] of index.byModel(days)) {
		read += t.cacheRead;
		prompt += t.input + t.cacheWrite + t.cacheRead;
		const price = priceFor(model);
		if (price) saved += (t.cacheRead * (price.input - price.cacheRead)) / 1e6;
	}
	return { hit: prompt ? (read / prompt) * 100 : null, read, prompt, saved };
}

/** Days in a row with Claude Code up to today (or yesterday, while today can still count), the best run, the last 7 days. */
export function streakStats(index, now) {
	const today = startOfDay(now);
	const requests = (d) => index.day(dayKey(d)).requests;
	const window = index.windowDays ?? 40;
	const todayActive = requests(today) > 0;
	let current = 0;
	for (let d = todayActive ? today : addDays(today, -1); current < window && requests(d) > 0; d = addDays(d, -1)) current++;
	let best = 0;
	let run = 0;
	for (let i = window - 1; i >= 0; i--) {
		run = requests(addDays(today, -i)) > 0 ? run + 1 : 0;
		best = Math.max(best, run);
	}
	// the log index keeps `window` days, so a streak that long may go back further
	const capped = current >= window - 1;
	const days = Array.from({ length: 35 }, (_, i) => requests(addDays(today, i - 34)));
	return { current, best, todayActive, capped, days };
}

function scanState(ctx, label) {
	const index = ctx.usage;
	if (!index.lastScan) return messageKey(label, "scanning…", { messageColor: COLORS.gray });
	if (ctx.usageError && !index.days.size) return messageKey(label, "read error", { big: "!", color: COLORS.orange });
	if (!index.roots.length) return messageKey(label, "no Claude logs", { big: "—", messageColor: COLORS.gray });
	return null;
}

function sources(ctx) {
	const index = ctx.usage;
	const scan = index.lastScan;
	return [
		["Sources", index.roots.length ? index.roots.map((r) => tildify(r)).join("\n") : "No Claude Code folders found"],
		["Scanned", scan ? `${scan.files.toLocaleString("en-US")} log files at ${clock(scan.at)} in ${scan.ms} ms` : "scanning…"],
	];
}

const CACHE_STYLES = PERCENT_STYLES.filter((st) => ["ring", "number", "bar", "gauge", "pie"].includes(st.id));
const millions = (n) => `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;

export const cacheAction = {
	id: "cache",
	uuid: `${PREFIX}.cache`,
	styles: CACHE_STYLES,

	normalize(raw) {
		const s = { periods: ["week", "month"], weekMode: "rolling", monthMode: "calendar", paths: "", refresh: 60, periodIndex: 0, style: "ring", ...(raw ?? {}) };
		normalizePeriods(s, ["week", "month"]);
		s.style = pick(s.style, styleIds(CACHE_STYLES), "ring");
		s.refresh = clampNumber(s.refresh, 15, 3600, 60);
		return s;
	},

	needs: (s) => ({ usage: s.paths }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		const period = currentPeriod(ctx.settings, ctx.now);
		const pending = scanState(ctx, period.label);
		if (pending) return pending;
		const c = cacheStats(ctx.usage, period.days);
		if (c.hit === null) return messageKey(period.label, "no Claude Code use", { big: "—", messageColor: COLORS.gray });
		// colour by misses: green from 70% hits, yellow from 40%, red below
		return renderPercent(style, {
			label: period.label,
			used: 100 - c.hit,
			show: "left",
			// the ring has room for a short word only
			display: { value: String(Math.floor(c.hit)), unit: "%", caption: style === "ring" ? "cached" : "cache hits" },
			footer: `saved ${formatMoney(c.saved)}`,
			resetsAt: null,
			now: ctx.now.getTime(),
			windowMs: 1,
			warn: 30,
			danger: 60,
		});
	},

	press: (ctx) => nextPeriod(ctx.settings),

	info(ctx) {
		const s = ctx.settings;
		const periods = s.periods.map((p) => getPeriod(p, s, ctx.now));
		const stats = periods.map((p) => cacheStats(ctx.usage, p.days));
		return {
			table: {
				columns: periods.map((p) => p.label),
				rows: [
					["Cache hits", ...stats.map((c) => (c.hit === null ? "—" : `${c.hit.toFixed(1)}%`))],
					["Read from cache", ...stats.map((c) => millions(c.read))],
					["All input", ...stats.map((c) => millions(c.prompt))],
					["Saved", ...stats.map((c) => formatMoney(c.saved))],
				],
				highlight: 0,
			},
			info: sources(ctx),
			note: "Saved: what the tokens read from the cache would have cost at the full input price of the API, minus what they cost as cache reads. Writing to the cache costs extra (1.25× or 2× the input price), which is not taken off here.",
		};
	},
};

export const streakAction = {
	id: "streak",
	uuid: `${PREFIX}.streak`,
	styles: STREAK_STYLES,

	normalize(raw) {
		const s = { paths: "", refresh: 300, style: "days", ...(raw ?? {}) };
		s.style = pick(s.style, styleIds(STREAK_STYLES), "days");
		s.paths = typeof s.paths === "string" ? s.paths.trim() : "";
		s.refresh = clampNumber(s.refresh, 15, 3600, 300);
		return s;
	},

	needs: (s) => ({ usage: s.paths }),
	refreshSeconds: (s) => s.refresh,

	render(ctx, style = ctx.settings.style) {
		return scanState(ctx, "STREAK") ?? renderStreak(style, { ...streakStats(ctx.usage, ctx.now), now: ctx.now });
	},

	press(ctx) {
		const ids = styleIds(STREAK_STYLES);
		ctx.settings.style = ids[(ids.indexOf(ctx.settings.style) + 1) % ids.length];
		return "save";
	},

	info(ctx) {
		const st = streakStats(ctx.usage, ctx.now);
		const window = ctx.usage.windowDays ?? 40;
		return {
			info: [
				["Streak", `${st.capped ? `${st.current}+` : st.current} days${st.todayActive ? "" : " (today not yet)"}`],
				["Best", `${st.best} days in the last ${window}`],
				["Active days", `${st.days.filter((n) => n > 0).length} of the last 35`],
				...sources(ctx),
			],
		};
	},
};
