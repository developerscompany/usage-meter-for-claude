// Claude service status key.
import { COLORS, esc, header, svg, text, textWidth } from "./svg.js";

export const STATUS_STYLES = [
	{ id: "badge", label: "Badge" },
	{ id: "detail", label: "Details" },
];

const LEVELS = [
	{ word: "OK", color: COLORS.green, icon: "check" },
	{ word: "MAINT.", color: COLORS.blue, icon: "info" },
	{ word: "DEGRADED", color: COLORS.yellow, icon: "bang" },
	{ word: "PARTIAL", color: COLORS.orange, icon: "bang" },
	{ word: "OUTAGE", color: COLORS.red, icon: "cross" },
];

function icon(kind, cx, cy, s) {
	const stroke = `stroke="${COLORS.bg}" stroke-width="${(s * 0.2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
	const p = (dx, dy) => `${(cx + dx * s).toFixed(1)} ${(cy + dy * s).toFixed(1)}`;
	if (kind === "check") return `<path d="M${p(-0.42, 0.02)} L${p(-0.12, 0.32)} L${p(0.45, -0.3)}" ${stroke}/>`;
	if (kind === "cross") return `<path d="M${p(-0.32, -0.32)} L${p(0.32, 0.32)} M${p(0.32, -0.32)} L${p(-0.32, 0.32)}" ${stroke}/>`;
	const dot = (dy) => `<circle cx="${cx.toFixed(1)}" cy="${(cy + dy * s).toFixed(1)}" r="${(s * 0.12).toFixed(1)}" fill="${COLORS.bg}"/>`;
	if (kind === "bang") return `<path d="M${p(0, -0.42)} L${p(0, 0.12)}" ${stroke}/>${dot(0.4)}`;
	return `${dot(-0.4)}<path d="M${p(0, -0.1)} L${p(0, 0.42)}" ${stroke}/>`;
}

function wrap(words, width) {
	const lines = [];
	let current = "";
	for (const word of String(words).split(/\s+/)) {
		if ((current + " " + word).trim().length > width && current) {
			lines.push(current);
			current = word;
		} else current = (current + " " + word).trim();
	}
	if (current) lines.push(current);
	return lines;
}

/** Font size at which a line fits `width` pixels, up to `max`. */
const fit = (line, width, max) => Math.min(max, Math.floor(width / textWidth(line, 1)));

/** Up to `max` lines of about `width` letters, the last one cut with an ellipsis when there is more. */
function lines(words, width, max) {
	const all = wrap(words, width);
	if (all.length <= max) return all;
	return [...all.slice(0, max - 1), `${all[max - 1]}…`];
}

/**
 * @param {{ label: string, level: number | null, text: string, detail?: string, notes?: string[], stale?: boolean }} v
 * detail: what is in trouble, e.g. "Fable 5", shown under the status word; notes: gray lines that replace `text`
 */
export function renderStatus(style, v) {
	if (v.level === null) return svg([header(v.label), text(72, 82, 42, COLORS.gray, "···"), text(72, 108, 13, COLORS.gray, esc(v.text || "checking…"))]);
	const level = LEVELS[v.level] ?? LEVELS[0];
	if (style === "detail") {
		const max = v.detail ? 2 : 3;
		const shown = v.notes?.length ? v.notes.slice(0, max) : lines(v.text, 17, max);
		return svg([
			header(v.label, { stale: v.stale }),
			`<circle cx="22" cy="52" r="8" fill="${level.color}"/>`,
			text(38, 58, 18, level.color, esc(level.word), { anchor: "start" }),
			...(v.detail ? [text(12, 84, fit(v.detail, 120, 16), COLORS.white, esc(v.detail), { anchor: "start" })] : []),
			...shown.map((l, i) => text(12, (v.detail ? 105 : 86) + i * 17, 13, COLORS.gray, esc(l), { anchor: "start", weight: "normal" })),
		]);
	}
	if (v.detail) {
		return svg([
			header(v.label, { stale: v.stale }),
			`<circle cx="72" cy="61" r="23" fill="${level.color}"/>`,
			icon(level.icon, 72, 61, 23),
			text(72, 108, 17, level.color, esc(level.word)),
			text(72, 131, fit(v.detail, 128, 17), COLORS.white, esc(v.detail)),
		]);
	}
	return svg([header(v.label, { stale: v.stale }), `<circle cx="72" cy="72" r="31" fill="${level.color}"/>`, icon(level.icon, 72, 72, 31), text(72, 128, 17, level.color, esc(level.word))]);
}
