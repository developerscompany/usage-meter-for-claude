// Token Usage and API Cost keys: a total for today / 7 days / this month with bars per day or hour.
import { formatTokens, formatUsd, joined } from "../format.js";
import { getPeriod } from "../periods.js";
import { SERIES_STYLES, renderSeries } from "../render/series.js";
import { startOfDay } from "../usage-index.js";
import { PREFIX, clampNumber, clock, currentPeriod, nextPeriod, normalizePeriods, pick, styleIds, tildify } from "./common.js";

export const TOKEN_COUNTS = {
	all: (t) => t.input + t.output + t.cacheWrite + t.cacheRead,
	"no-cache-read": (t) => t.input + t.output + t.cacheWrite,
	io: (t) => t.input + t.output,
};

const millions = (n) => (n >= 1e8 ? `${Math.round(n / 1e6).toLocaleString("en-US")}M` : `${(n / 1e6).toFixed(n >= 1e6 ? 1 : 2)}M`);
const dollars = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function seriesAction({ id, defaults, value, format }) {
	return {
		id,
		uuid: `${PREFIX}.${id}`,
		styles: SERIES_STYLES,

		normalize(raw) {
			const s = { ...defaults, ...(raw ?? {}) };
			normalizePeriods(s, defaults.periods);
			s.style = pick(s.style, styleIds(SERIES_STYLES), "classic");
			if ("count" in defaults) s.count = pick(s.count, Object.keys(TOKEN_COUNTS), "all");
			s.refresh = clampNumber(s.refresh, 15, 3600, 60);
			return s;
		},

		needs: (s) => ({ usage: s.paths }),
		refreshSeconds: (s) => s.refresh,

		render(ctx, style = ctx.settings.style) {
			const s = ctx.settings;
			const period = currentPeriod(s, ctx.now);
			const base = { label: period.label, dots: s.periods.length, dot: s.periodIndex };
			const index = ctx.usage;
			if (!index.lastScan) return renderSeries(style, { ...base, state: "loading", message: "scanning…" });
			if (ctx.usageError && !index.days.size) return renderSeries(style, { ...base, state: "error", message: "read error" });
			if (!index.roots.length) return renderSeries(style, { ...base, state: "empty", message: "no Claude logs" });

			const total = value(index.sum(period.days), s);
			const hours = Math.max(1, (ctx.now - startOfDay(ctx.now)) / 3_600_000);
			const rate = period.hourly ? `~${joined(format(total / hours))}/h` : `~${joined(format(total / period.days.length))}/day`;
			const bars = period.slots.map((slot) => ({
				value: value(period.hourly ? index.hour(slot) : index.day(slot), s),
				today: slot === period.today,
				future: slot > period.today,
			}));
			return renderSeries(style, { ...base, value: format(total), rate, bars });
		},

		press: (ctx) => nextPeriod(ctx.settings),

		info(ctx) {
			const s = ctx.settings;
			const index = ctx.usage;
			const periods = s.periods.map((p) => getPeriod(p, s, ctx.now));
			const sums = periods.map((p) => index.sum(p.days));
			const rows = [
				["On key", ...sums.map((t) => joined(format(value(t, s))))],
				["Input", ...sums.map((t) => millions(t.input))],
				["Output", ...sums.map((t) => millions(t.output))],
				["Cache write", ...sums.map((t) => millions(t.cacheWrite))],
				["Cache read", ...sums.map((t) => millions(t.cacheRead))],
				["Requests", ...sums.map((t) => t.requests.toLocaleString("en-US"))],
				["API cost", ...sums.map((t) => dollars(t.cost))],
			];
			const scan = index.lastScan;
			return {
				table: { columns: periods.map((p) => p.label), rows, highlight: 0 },
				info: [
					["Sources", index.roots.length ? index.roots.map((r) => tildify(r)).join("\n") : "No Claude Code folders found"],
					["Scanned", scan ? `${scan.files.toLocaleString("en-US")} log files at ${clock(scan.at)} in ${scan.ms} ms` : "scanning…"],
				],
				error: ctx.usageError,
			};
		},
	};
}

export const tokensAction = seriesAction({
	id: "usage",
	defaults: { periods: ["week", "month"], weekMode: "rolling", monthMode: "calendar", count: "all", paths: "", refresh: 60, periodIndex: 0, style: "classic" },
	value: (t, s) => TOKEN_COUNTS[s.count](t),
	format: formatTokens,
});

export const costAction = seriesAction({
	id: "cost",
	defaults: { periods: ["today", "week", "month"], weekMode: "rolling", monthMode: "calendar", paths: "", refresh: 60, periodIndex: 0, style: "classic" },
	value: (t) => t.cost,
	format: formatUsd,
});
