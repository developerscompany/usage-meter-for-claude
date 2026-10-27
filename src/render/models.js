// Which models the usage went to: donut, bars, stacked bar.
import { COLORS, arc, bar, esc, header, rect, svg, text, valueWithUnit } from "./svg.js";

export const MODEL_STYLES = [
	{ id: "donut", label: "Donut" },
	{ id: "bars", label: "Bars" },
	{ id: "stack", label: "Stacked" },
];

export const FAMILY_COLORS = {
	opus: COLORS.orange,
	sonnet: COLORS.blue,
	haiku: COLORS.green,
	fable: COLORS.purple,
	other: COLORS.gray,
};

const pct = (share) => (share > 0 && share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`);

/**
 * @param {{ label: string, items: { name: string, family: string, share: number }[], total: string }} v
 */
const STYLES = {
	donut(v) {
		const out = [];
		if (!v.items.length) return [text(72, 84, 13, COLORS.gray, "no usage")];
		let from = 0;
		const gap = v.items.length > 1 ? 2 : 0;
		for (const item of v.items) {
			const to = from + item.share * 360;
			if (to - from > gap) out.push(arc(72, 80, 38, from + gap / 2, to - gap / 2, FAMILY_COLORS[item.family], 13, { cap: "butt" }));
			from = to;
		}
		const top = v.items[0];
		out.push(valueWithUnit(72, 84, 24, FAMILY_COLORS[top.family], pct(top.share).replace("%", ""), "%"));
		out.push(text(72, 99, 11, COLORS.gray, esc(top.name.toUpperCase())));
		out.push(text(72, 138, 13, COLORS.gray, esc(v.total)));
		return out;
	},

	bars(v) {
		if (!v.items.length) return [text(72, 84, 13, COLORS.gray, "no usage")];
		const out = [];
		v.items.slice(0, 4).forEach((item, i) => {
			const y = 48 + i * 24;
			const color = FAMILY_COLORS[item.family];
			out.push(text(10, y, 13, COLORS.text, esc(item.name), { anchor: "start" }));
			out.push(text(134, y, 13, color, pct(item.share), { anchor: "end" }));
			out.push(bar(10, y + 5, 124, 5, item.share, color));
		});
		if (v.items.length <= 3) out.push(text(72, 138, 13, COLORS.gray, esc(v.total)));
		return out;
	},

	stack(v) {
		if (!v.items.length) return [text(72, 84, 13, COLORS.gray, "no usage")];
		const out = [rect(10, 38, 124, 20, COLORS.track, { rx: 5 })];
		let x = 10;
		for (const item of v.items) {
			const w = item.share * 124;
			if (w >= 0.5) out.push(rect(x, 38, w, 20, FAMILY_COLORS[item.family]));
			x += w;
		}
		v.items.slice(0, 3).forEach((item, i) => {
			const y = 84 + i * 21;
			out.push(`<circle cx="16" cy="${y - 5}" r="5" fill="${FAMILY_COLORS[item.family]}"/>`);
			out.push(text(27, y, 14, COLORS.text, `<tspan>${esc(item.name)}</tspan> <tspan fill="${COLORS.gray}">${pct(item.share)}</tspan>`, { anchor: "start" }));
		});
		return out;
	},
};

export function renderModels(style, v) {
	return svg([header(v.label), ...(STYLES[style] ?? STYLES.donut)(v)]);
}
