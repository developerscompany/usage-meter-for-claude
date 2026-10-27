// Both plan limits (5-hour and weekly) on one key.
import { formatDuration, percentParts } from "../format.js";
import { COLORS, arc, bar, esc, levelColor, oldNumbers, svg, text, valueWithUnit } from "./svg.js";

export const DUAL_STYLES = [
	{ id: "bars", label: "Bars" },
	{ id: "rings", label: "Rings" },
	{ id: "split", label: "Numbers" },
	{ id: "timers", label: "Reset timers" },
];

/**
 * @typedef {{ used: number, resetsAt: number | null, reset?: boolean } | null} Window
 * @param {{ five: Window, week: Window, show: "used" | "left", warn: number, danger: number, now: number, tag?: string, stale?: boolean, old?: string, labels?: [string, string] }} v
 */
function rowOf(w, v) {
	if (!w) return { value: "—", unit: "", fraction: 0, color: COLORS.gray, reset: "" };
	const { used, left } = percentParts(w.used);
	const shown = v.show === "left" ? left : used;
	return {
		value: String(shown),
		unit: "%",
		fraction: shown / 100,
		color: levelColor(w.used, v.warn, v.danger),
		reset: w.reset ? "reset" : w.resetsAt ? formatDuration(w.resetsAt - v.now) : "",
	};
}

const STYLES = {
	bars(v, [a, b], [la, lb]) {
		const row = (y, label, r) => [
			text(10, y, 15, COLORS.gray, esc(label), { anchor: "start" }),
			valueWithUnit(134, y + 2, 26, r.color, r.value, r.unit, { anchor: "end" }),
			bar(10, y + 10, 124, 9, r.fraction, r.color),
			text(134, y + 33, 12, COLORS.gray, esc(r.reset), { anchor: "end" }),
		];
		return [...row(30, la, a), ...row(92, lb, b), text(10, 125, 12, COLORS.gray, esc(v.show), { anchor: "start" })];
	},

	rings(v, [a, b], [la, lb]) {
		return [
			arc(72, 72, 58, 0, 360, COLORS.track, 9),
			arc(72, 72, 58, 0, b.fraction * 360, b.color, 9),
			arc(72, 72, 44, 0, 360, COLORS.track, 9),
			arc(72, 72, 44, 0, a.fraction * 360, a.color, 9),
			text(72, 54, 11, COLORS.gray, esc(la)),
			valueWithUnit(72, 80, 26, a.color, a.value, a.unit),
			text(72, 98, 12, b.color, `<tspan fill="${COLORS.gray}">${esc(lb)}</tspan> <tspan>${esc(b.value + b.unit)}</tspan>`),
		];
	},

	split(v, [a, b], [la, lb]) {
		const half = (y, label, r) => [
			text(12, y, 15, COLORS.gray, esc(label), { anchor: "start" }),
			text(12, y + 22, 12, COLORS.gray, esc(r.reset), { anchor: "start" }),
			valueWithUnit(134, y + 20, 38, r.color, r.value, r.unit, { anchor: "end" }),
		];
		return [...half(32, la, a), `<line x1="10" y1="72" x2="134" y2="72" stroke="${COLORS.track}" stroke-width="2"/>`, ...half(102, lb, b)];
	},

	timers(v, [a, b], [la, lb]) {
		const half = (y, label, r) => [
			text(12, y, 15, COLORS.gray, esc(label), { anchor: "start" }),
			text(12, y + 22, 13, r.color, esc(r.value + r.unit), { anchor: "start" }),
			text(134, y + 18, 26, COLORS.white, esc(r.reset || "—"), { anchor: "end" }),
		];
		return [...half(32, la, a), `<line x1="10" y1="72" x2="134" y2="72" stroke="${COLORS.track}" stroke-width="2"/>`, ...half(102, lb, b)];
	},
};

export function renderDual(style, v) {
	const rows = [rowOf(v.five, v), rowOf(v.week, v)];
	const labels = v.labels ?? ["5H", "7D"];
	const parts = (STYLES[style] ?? STYLES.bars)(v, rows, labels);
	if (v.tag) parts.push(text(136, 14, 11, COLORS.gray, esc(v.tag), { anchor: "end" }));
	if (v.old) return svg(oldNumbers(parts, v.old));
	if (v.stale) parts.push(`<circle cx="72" cy="139" r="3" fill="none" stroke="${COLORS.gray}" stroke-width="1.5"/>`);
	return svg(parts);
}
