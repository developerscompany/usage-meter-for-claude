// Sample keys for docs/gallery.png and the Marketplace images: the real renderers and actions, with made-up numbers.
import { apiCreditAction } from "../src/actions/console.js";
import { launchAction } from "../src/actions/launch.js";
import { creditAction } from "../src/actions/limits.js";
import { peakAction } from "../src/actions/peak.js";
import { renderDual } from "../src/render/dual.js";
import { renderModels } from "../src/render/models.js";
import { renderPercent } from "../src/render/percent.js";
import { renderSeries } from "../src/render/series.js";
import { renderStatus } from "../src/render/status.js";
import { renderStreak } from "../src/render/streak.js";

export const H = 3_600_000;
export const now = Date.parse("2026-10-20T18:13:00Z");
const five = (t0) => Array.from({ length: 28 }, (_, i) => [t0 + i * 6 * 60_000, Math.round(i * 0.9 + (i > 18 ? (i - 18) * 0.8 : 0))]);
const week = Array.from({ length: 90 }, (_, i) => [now - 4.4 * 24 * H + i * 70 * 60_000, Math.min(100, Math.round(i * 0.55 + (i > 60 ? 6 : 0)))]);
export const fiveView = { label: "5-HOUR", used: 25.4, show: "left", resetsAt: now + 2 * H + 47 * 60_000, now, windowMs: 5 * H, warn: 50, danger: 80, series: five(now - 2.2 * H), tag: "N" };
export const weekView = { label: "WEEKLY", used: 52, show: "used", resetsAt: now + 61 * H, now, windowMs: 7 * 24 * H, warn: 50, danger: 80, series: week };
export const hotView = { ...fiveView, used: 86.7, show: "used", tag: "" };

const dayBars = (values, today) => values.map((v, i) => ({ value: v * 1e6, today: i === today, future: i > today }));
const month = dayBars([38, 52, 61, 0, 44, 95, 72, 58, 66, 41, 0, 12, 83, 77, 64, 91, 55, 70, 49, 26, ...Array(11).fill(0)], 19);
const weekBars = dayBars([66, 41, 0, 12, 83, 77, 26], 6);
const hours = dayBars([0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 5, 9, 4, 1, 7, 11, 8, 3, 6, 4, 0, 0, 0, 0], 18).map((b) => ({ ...b, value: b.value / 20 }));
const items = [
	{ name: "Opus", family: "opus", share: 0.71 },
	{ name: "Sonnet", family: "sonnet", share: 0.22 },
	{ name: "Haiku", family: "haiku", share: 0.06 },
	{ name: "Fable", family: "fable", share: 0.01 },
];

// The credit key through its real action code, with a fake limits service.
const cloudCredit = { label: "Cloud session credits", used: 11.2, limit: 250, spent: 28, remaining: 222, resetsAt: now + 15.5 * 24 * H, recurring: false };
export const creditKey = (style, show = "left") =>
	creditAction.render({ settings: creditAction.normalize({ style, show }), limits: { data: { credit: cloudCredit }, error: null, stale: () => false }, now: new Date(now) });

// The API Credit key through its real action code, with a fake cost report: $9.75 spent since Oct 18.
const apiSpend = new Map([["2026-10-19", 5.125], ["2026-10-20", 4.625]]);
const apiService = { fetchedAt: now, error: null, stale: () => false, spendSince: (d) => [...apiSpend].filter(([k]) => k >= d).reduce((s, [, v]) => s + v, 0), spendOn: (d) => apiSpend.get(d) ?? 0 };
export const apiCredit = (settings) => apiCreditAction.render({ settings: apiCreditAction.normalize(settings), console: apiService, now: new Date(now) });
export const apiCreditKey = (style, show = "left") => apiCredit({ amount: 200, granted: "2026-10-18", expires: "2026-11-01", style, show });

/** Peak hours at a moment of 2026-10-20 (UTC): 15:00 is peak, 11:45 soon, 19:30 off-peak. */
export const peakKey = (style, iso, clock = "24") => peakAction.render({ settings: peakAction.normalize({ style, clock }), now: new Date(iso) });
export const PEAK_MOMENTS = [["PEAK", "2026-10-20T15:00:00Z"], ["SOON", "2026-10-20T11:45:00Z"], ["OFF-PEAK", "2026-10-20T19:30:00Z"]];

export const cacheKey = (style) =>
	renderPercent(style, { label: "7 DAYS", used: 4.9, show: "left", display: { value: "95", unit: "%", caption: style === "ring" ? "cached" : "cache hits" }, footer: "saved $105", resetsAt: null, now, windowMs: 1, warn: 30, danger: 60 });
export const streakKey = (style) =>
	renderStreak(style, { current: 12, best: 12, todayActive: true, capped: false, days: Array.from({ length: 35 }, (_, i) => (i > 22 ? 5 + ((i * 37) % 60) : i % 9 === 0 ? 20 : 0)), now: new Date(now) });
export const streakNotYetKey = () =>
	renderStreak("days", { current: 5, best: 9, todayActive: false, capped: false, days: Array.from({ length: 35 }, (_, i) => (i >= 29 && i < 34 ? 10 : 0)), now: new Date(now) });
export const launchKey = (folder = "~/projects/app") => launchAction.render({ settings: launchAction.normalize({ folder }) });
export const dualKey = (style) =>
	renderDual(style, { five: { used: 25.4, resetsAt: now + 2 * H + 47 * 60_000 }, week: { used: 52, resetsAt: now + 61 * H }, show: "left", warn: 50, danger: 80, now, tag: "N" });
export const tokensKey = (style) => renderSeries(style, { label: "OCTOBER", value: { num: "1054", unit: "M" }, rate: "~52.7M/day", bars: month, dots: 2, dot: 1 });
export const costWeekKey = () => renderSeries("classic", { label: "7 DAYS", value: { num: "$212", unit: "" }, rate: "~$30.3/day", bars: weekBars, dots: 3, dot: 1 });
export const costTodayKey = () => renderSeries("chart", { label: "TODAY", value: { num: "$48.2", unit: "" }, rate: "~$2.6/h", bars: hours, dots: 3, dot: 0 });
export const modelsKey = (style) => renderModels(style, { label: "7 DAYS", items, total: "432M tokens" });
export const contextKey = () =>
	renderPercent("ring", { label: "CONTEXT", used: 14.2, show: "used", display: { value: "142K", unit: "", caption: "of 1M" }, footer: "streamdeck · 2m", resetsAt: null, now, windowMs: 1, warn: 50, danger: 80, tag: "1/3" });
export const extraKey = () => renderPercent("ring", { label: "EXTRA", used: 24.6, show: "used", footer: "$12.30 / $50", resetsAt: now + 11 * 24 * H, now, windowMs: 31 * 24 * H, warn: 50, danger: 80 });
export const statusKey = (style) =>
	renderStatus(style, { label: "CLAUDE", level: 2, text: "Degraded performance for Claude Fable 5", detail: "Fable 5", notes: ["Investigating", "claude.ai +3"] });
export const statusOkKey = () => renderStatus("badge", { label: "CLAUDE", level: 0, text: "All Systems Operational" });
