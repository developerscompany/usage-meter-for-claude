// Tokens and cost over a period: a big number plus bars per day (or per hour for today).
import { COLORS, esc, fitSize, header, labelWidth, rect, svg, text, textWidth, valueWithUnit } from "./svg.js";

export const SERIES_STYLES = [
	{ id: "classic", label: "Number + chart" },
	{ id: "number", label: "Number" },
	{ id: "chart", label: "Chart" },
];

const UNIT_SCALE = 0.62;

function bars(list, x0, top, w, h) {
	if (!list?.length) return "";
	const n = list.length;
	const gap = n > 14 ? 1 : 4;
	const bw = (w - gap * (n - 1)) / n;
	const max = Math.max(1, ...list.filter((b) => !b.future).map((b) => b.value));
	const bottom = top + h;
	let out = "";
	list.forEach((b, i) => {
		const x = x0 + i * (bw + gap);
		if (b.future || !b.value) {
			out += rect(x, bottom - 2, bw, 2, b.future ? COLORS.track : COLORS.dim);
			return;
		}
		const bh = Math.max(2, Math.round((b.value / max) * h));
		out += rect(x, bottom - bh, bw, bh, COLORS.green, b.today ? {} : { opacity: 0.45 });
	});
	return out;
}

function dots(count, active, y = 134, x = 72) {
	if (!(count > 1)) return "";
	const step = 10;
	const x0 = x - ((count - 1) * step) / 2;
	let out = "";
	for (let i = 0; i < count; i++) out += `<circle cx="${x0 + i * step}" cy="${y}" r="2.5" fill="${i === active ? COLORS.white : COLORS.dim}"/>`;
	return out;
}

/**
 * @param {"classic" | "number" | "chart"} style
 * @param {{ label: string, value?: { num: string, unit: string }, rate?: string, bars?: { value: number, today?: boolean, future?: boolean }[],
 *           dots?: number, dot?: number, state?: "ok" | "loading" | "empty" | "error", message?: string }} v
 */
export function renderSeries(style, v) {
	const state = v.state ?? "ok";
	if (state !== "ok") {
		const big = state === "loading" ? "···" : state === "empty" ? "—" : "!";
		return svg([
			header(v.label),
			text(72, 76, 44, state === "error" ? COLORS.orange : COLORS.gray, big),
			text(72, 97, 13, state === "loading" ? COLORS.gray : COLORS.orange, esc(v.message ?? "")),
			dots(v.dots, v.dot),
		]);
	}
	const { num, unit } = v.value;
	if (style === "chart") {
		// The label and the rate share the bottom line: shorten the rate, or drop it, when they would touch.
		const room = 124 - labelWidth(v.label, 13) - 8;
		const rate = [v.rate ?? "", (v.rate ?? "").replace("/day", "/d")].find((r) => textWidth(r, 12) <= room) ?? "";
		return svg([
			valueWithUnit(72, 34, fitSize(num, unit, 126, 30, UNIT_SCALE), COLORS.green, num, unit, { unitScale: UNIT_SCALE }),
			bars(v.bars, 10, 44, 124, 72),
			text(10, 135, 13, COLORS.white, esc(v.label), { anchor: "start" }),
			text(134, 135, 12, COLORS.gray, esc(rate), { anchor: "end" }),
		]);
	}
	if (style === "number") {
		return svg([
			header(v.label),
			valueWithUnit(72, 88, fitSize(num, unit, 126, 60, UNIT_SCALE), COLORS.green, num, unit, { unitScale: UNIT_SCALE }),
			text(72, 113, 15, COLORS.green, esc(v.rate ?? ""), { opacity: 0.75 }),
			dots(v.dots, v.dot),
		]);
	}
	return svg([
		text(72, 26, 18, COLORS.white, esc(v.label)),
		valueWithUnit(72, 76, fitSize(num, unit, 124, 50, UNIT_SCALE), COLORS.green, num, unit, { unitScale: UNIT_SCALE }),
		text(72, 97, 15, COLORS.green, esc(v.rate ?? ""), { opacity: 0.75 }),
		bars(v.bars, 14, 105, 116, 20),
		dots(v.dots, v.dot),
	]);
}
