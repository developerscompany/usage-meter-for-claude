// Display styles for a percentage with a reset time: plan limits, extra usage, context window.
import { formatDuration, percentParts } from "../format.js";
import { COLORS, arc, bar, esc, fitSize, header, labelWidth, levelColor, oldNumbers, polar, rect, slice, svg, text, textWidth, valueWithUnit } from "./svg.js";

export const PERCENT_STYLES = [
	{ id: "ring", label: "Ring" },
	{ id: "number", label: "Number" },
	{ id: "bar", label: "Bar" },
	{ id: "pie", label: "Pie" },
	{ id: "battery", label: "Battery" },
	{ id: "gauge", label: "Gauge" },
	{ id: "segments", label: "LED" },
	{ id: "pace", label: "Pace" },
	{ id: "history", label: "History" },
	{ id: "countdown", label: "Reset timer" },
];

/**
 * @typedef {object} PercentView
 * @property {string} label
 * @property {number} used          percent used, 0-100
 * @property {"used" | "left"} show
 * @property {number | null} resetsAt
 * @property {number} now
 * @property {number} windowMs
 * @property {number} warn
 * @property {number} danger
 * @property {[number, number][]} [series]   samples [time, percent used]
 * @property {string} [tag]
 * @property {boolean} [stale]
 * @property {string} [old]         numbers that are no longer current: why, e.g. "login expired" or "3h old"
 * @property {boolean} [reset]      the window has reset since the numbers were fetched
 * @property {string} [footer]      replaces the reset countdown
 * @property {{ value: string, unit: string, caption: string }} [display]  replaces the percent (context and credit keys)
 * @property {string} [until]       countdown caption, "until reset" by default
 */

function resetText(v) {
	if (v.reset) return "reset";
	if (!v.resetsAt) return v.used > 0 ? "" : "not started";
	return formatDuration(v.resetsAt - v.now);
}

function partsOf(v) {
	const { used, left } = percentParts(v.used);
	const shown = v.show === "left" ? left : used;
	return {
		used,
		left,
		fraction: shown / 100,
		color: levelColor(v.used, v.warn, v.danger),
		value: v.display?.value ?? String(shown),
		unit: v.display ? v.display.unit : "%",
		caption: v.display?.caption ?? (v.show === "left" ? "left" : "used"),
		footer: v.footer ?? resetText(v),
	};
}

const line = (...items) => items.filter(Boolean).join(" · ");
const WIDTH = 136;

/** "a · b · c" wrapped at the dots onto at most `max` lines; what does not fit is left out. */
function wrapDots(content, size, max) {
	const rows = [];
	for (const part of content.split(" · ").filter(Boolean)) {
		const joinedRow = rows.length ? `${rows.at(-1)} · ${part}` : null;
		if (joinedRow && textWidth(joinedRow, size) <= WIDTH) rows[rows.length - 1] = joinedRow;
		else if (rows.length < max) rows.push(part);
		else break;
	}
	return rows;
}

/** One line at the largest size down to `min` that fits, else at `size` with its last parts left out. */
function fitLine(content, size, min = Math.max(11, size - 2)) {
	for (let s = size; s >= min; s--) if (textWidth(content, s) <= WIDTH) return { size: s, content };
	return { size, content: wrapDots(content, size, 1)[0] ?? "" };
}

function footerText(y, size, footer) {
	const f = fitLine(footer, size);
	return text(72, y, f.size, COLORS.gray, esc(f.content));
}

/** Caption and footer on one line, or on two smaller lines (`two`: [y1, y2, size]) when they do not fit. */
function captionLines(p, y, size, two) {
	const content = line(p.caption, p.footer);
	const one = fitLine(content, size, two ? size : undefined);
	if (!two || one.content === content) return [text(72, y, one.size, COLORS.gray, esc(one.content))];
	const [y1, y2, small] = two;
	const rows = wrapDots(content, small, 2);
	if (rows.length < 2) return [text(72, y, small, COLORS.gray, esc(rows[0] ?? ""))];
	return rows.map((row, i) => text(72, i ? y2 : y1, small, COLORS.gray, esc(row)));
}

const STYLES = {
	ring(v, p) {
		const size = fitSize(p.value, p.unit, 54, 30);
		return [
			arc(72, 80, 37, 0, 360, COLORS.track, 11),
			arc(72, 80, 37, 0, p.fraction * 360, p.color, 11),
			valueWithUnit(72, 87, size, p.color, p.value, p.unit),
			text(72, 102, Math.min(11, Math.floor(60 / (0.58 * Math.max(1, p.caption.length)))), COLORS.gray, esc(p.caption)),
			footerText(138, 13, p.footer),
		];
	},

	number(v, p) {
		return [
			valueWithUnit(72, 88, fitSize(p.value, p.unit, 126, 58), p.color, p.value, p.unit),
			text(72, 110, 14, COLORS.gray, esc(p.caption.toUpperCase())),
			footerText(136, 14, p.footer),
		];
	},

	bar(v, p) {
		return [
			valueWithUnit(72, 78, fitSize(p.value, p.unit, 126, 46), p.color, p.value, p.unit),
			bar(12, 90, 120, 14, p.fraction, p.color),
			...captionLines(p, 128, 14, [121, 138, 12]),
		];
	},

	pie(v, p) {
		// Qt drops spaces inside a <tspan>, so the gap is a text node between two of them.
		const value = `<tspan font-size="22" fill="${p.color}">${esc(p.value + p.unit)}</tspan> <tspan font-size="13" fill="${COLORS.gray}">${esc(p.caption)}</tspan>`;
		return [
			`<circle cx="72" cy="67" r="29" fill="${COLORS.track}"/>`,
			slice(72, 67, 29, 0, p.fraction * 360, p.color),
			text(72, 119, 22, p.color, value),
			footerText(137, 13, p.footer),
		];
	},

	battery(v, p) {
		return [
			rect(14, 44, 104, 54, "none", { rx: 10, stroke: "#d1d1d6", strokeWidth: 4 }),
			rect(120, 61, 8, 20, "#d1d1d6", { rx: 3 }),
			rect(21, 51, 90 * Math.min(1, p.fraction), 40, p.color, { rx: 5 }),
			valueWithUnit(66, 81, fitSize(p.value, p.unit, 84, 28), COLORS.white, p.value, p.unit, { outline: COLORS.bg }),
			...captionLines(p, 127, 14, [118, 136, 12]),
		];
	},

	gauge(v, p) {
		const angle = -120 + 240 * Math.min(1, p.fraction);
		const [nx, ny] = polar(72, 80, 32, angle);
		return [
			arc(72, 80, 44, -120, 120, COLORS.track, 10),
			arc(72, 80, 44, -120, angle, p.color, 10),
			`<line x1="72" y1="80" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" stroke="${COLORS.white}" stroke-width="3" stroke-linecap="round"/>`,
			`<circle cx="72" cy="80" r="5" fill="${COLORS.white}"/>`,
			valueWithUnit(72, 120, fitSize(p.value, p.unit, 70, 24), p.color, p.value, p.unit),
			...captionLines(p, 139, 12),
		];
	},

	segments(v, p) {
		const lit = p.fraction > 0 ? Math.max(1, Math.round(p.fraction * 10)) : 0;
		const out = [valueWithUnit(72, 64, fitSize(p.value, p.unit, 126, 38), p.color, p.value, p.unit)];
		for (let i = 0; i < 10; i++) {
			// fuel-gauge colouring: each segment takes the colour of the usage it stands for
			const stands = v.show === "left" ? 100 - (i + 0.5) * 10 : (i + 0.5) * 10;
			out.push(rect(12 + i * 12.3, 76, 9.3, 34, i < lit ? levelColor(stands, v.warn, v.danger) : COLORS.track, { rx: 2 }));
		}
		out.push(...captionLines(p, 132, 14, [126, 141, 12]));
		return out;
	},

	pace(v, p) {
		const out = [valueWithUnit(72, 62, fitSize(p.value, p.unit, 126, 38), p.color, p.value, p.unit), bar(12, 74, 120, 12, p.used / 100, p.color)];
		const elapsed = v.resetsAt ? v.windowMs - (v.resetsAt - v.now) : null;
		const timeShare = elapsed === null ? null : Math.max(0, Math.min(1, elapsed / v.windowMs));
		if (timeShare === null || timeShare < 0.02 || v.reset) {
			out.push(text(72, 110, 14, COLORS.gray, "pace —"), text(72, 130, 13, COLORS.gray, esc(p.footer)));
			return out;
		}
		const x = 12 + 120 * timeShare;
		out.push(`<line x1="${x.toFixed(2)}" y1="70" x2="${x.toFixed(2)}" y2="90" stroke="${COLORS.white}" stroke-width="2"/>`);
		const daily = v.windowMs >= 86_400_000;
		const rate = p.used / (elapsed / (daily ? 86_400_000 : 3_600_000));
		const projected = p.used / timeShare;
		const verdict = projected > 100 ? ["fast", COLORS.red] : projected > 90 ? ["tight", COLORS.yellow] : ["ok", COLORS.green];
		const rateText = `~${rate < 10 ? rate.toFixed(1) : Math.round(rate)}%/${daily ? "d" : "h"}`;
		out.push(text(72, 110, 14, verdict[1], `<tspan fill="${COLORS.gray}">${esc(rateText)}</tspan> <tspan fill="${COLORS.gray}">·</tspan> <tspan>${verdict[0]}</tspan>`));
		const toLimit = projected > 100 && p.used < 100 ? ((100 - p.used) / p.used) * elapsed : null;
		const bottom = toLimit !== null && toLimit < v.resetsAt - v.now ? `limit in ${formatDuration(toLimit)}` : `reset ${p.footer}`;
		out.push(text(72, 130, 13, toLimit !== null ? COLORS.orange : COLORS.gray, esc(bottom)));
		return out;
	},

	history(v, p) {
		const x0 = 10;
		const w = 124;
		const top = 38;
		const h = 76;
		const end = v.resetsAt && !v.reset ? v.resetsAt : v.now;
		const start = end - v.windowMs;
		const value = (used) => (v.show === "left" ? 100 - used : used);
		const px = (t) => x0 + ((t - start) / (end - start)) * w;
		const py = (pct) => top + h - (Math.max(0, Math.min(100, pct)) / 100) * h;

		const valueRoom = Math.max(30, w - labelWidth(v.label, 15) - 8);
		const out = [
			text(x0, 25, 15, COLORS.white, esc(v.label), { anchor: "start" }),
			valueWithUnit(134, 27, fitSize(p.value, p.unit, valueRoom, 22), p.color, p.value, p.unit, { anchor: "end" }),
			`<line x1="${x0}" y1="${top}" x2="${x0 + w}" y2="${top}" stroke="${COLORS.track}" stroke-width="1" stroke-dasharray="3 3"/>`,
			`<line x1="${x0}" y1="${top + h / 2}" x2="${x0 + w}" y2="${top + h / 2}" stroke="${COLORS.track}" stroke-width="1" stroke-dasharray="3 3"/>`,
			`<line x1="${x0}" y1="${top + h}" x2="${x0 + w}" y2="${top + h}" stroke="${COLORS.dim}" stroke-width="1"/>`,
		];

		let points = (v.series ?? []).filter(([t]) => t >= start && t <= v.now);
		if (v.reset) points = [];
		// A window starts empty; fill in its start only when the first sample is close to it.
		if (points.length && v.resetsAt && points[0][0] > start + 60_000 && points[0][0] - start < v.windowMs * 0.1) points.unshift([start, 0]);
		if (points.length) {
			const last = points.at(-1);
			const steps = [];
			points.forEach(([t, used], i) => {
				if (i) steps.push([px(t), py(value(points[i - 1][1]))]);
				steps.push([px(t), py(value(used))]);
			});
			steps.push([px(v.now), py(value(last[1]))]);
			const linePts = steps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
			const area = `${steps[0][0].toFixed(1)},${top + h} ${linePts} ${steps.at(-1)[0].toFixed(1)},${top + h}`;
			out.push(`<polygon points="${area}" fill="${p.color}" fill-opacity="0.22"/>`);
			out.push(`<polyline points="${linePts}" fill="none" stroke="${p.color}" stroke-width="2.5" stroke-linejoin="round"/>`);
			const [cx, cy] = steps.at(-1);
			out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${p.color}"/>`);
			if (v.resetsAt && !v.reset && v.show !== "left" && v.now > start) {
				const projected = (last[1] / (v.now - start)) * (end - start);
				out.push(`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${py(projected).toFixed(1)}" stroke="${COLORS.gray}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
			}
		} else {
			out.push(text(72, top + h / 2 + 4, 12, COLORS.gray, "collecting data"));
		}
		out.push(text(x0, 137, 13, COLORS.gray, esc(p.footer), { anchor: "start" }));
		out.push(text(134, 137, 13, COLORS.gray, esc(v.tag ? `${p.caption} · ${v.tag}` : p.caption), { anchor: "end" }));
		return out;
	},

	countdown(v, p) {
		const remaining = v.resetsAt && !v.reset ? formatDuration(v.resetsAt - v.now) : "—";
		return [
			valueWithUnit(72, 76, fitSize(remaining, "", 126, 40), COLORS.white, remaining, ""),
			text(72, 96, 12, COLORS.gray, v.reset ? "window reset" : (v.until ?? "until reset")),
			bar(12, 106, 120, 8, p.fraction, p.color),
			text(72, 135, 15, p.color, `<tspan>${esc(p.value + p.unit)}</tspan> <tspan fill="${COLORS.gray}" font-size="13">${esc(p.caption)}</tspan>`),
		];
	},
};

// styles whose caption sits in the bottom band, where old numbers get their note instead
const BOTTOM_CAPTION = new Set(["bar", "battery", "segments", "gauge"]);

/** @param {PercentView} view */
export function renderPercent(style, view) {
	const p = partsOf(view);
	if (view.old) {
		p.footer = "";
		if (BOTTOM_CAPTION.has(style)) p.caption = "";
	}
	const draw = STYLES[style] ?? STYLES.ring;
	const body = view.old ? oldNumbers(draw(view, p), view.old) : draw(view, p);
	return style === "history" ? svg([...body, view.stale ? `<circle cx="11" cy="6" r="3" fill="none" stroke="${COLORS.gray}" stroke-width="1.5"/>` : ""]) : svg([header(view.label, view), ...body]);
}
