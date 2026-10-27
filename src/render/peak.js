// Peak Hours key: whether it is peak time, how long until it ends or starts, and the day on a 24-hour line.
import { clockRange, clockTime } from "../clock.js";
import { formatDuration } from "../format.js";
import { COLORS, esc, fitSize, header, labelWidth, rect, svg, text, textWidth, valueWithUnit } from "./svg.js";

export const PEAK_STYLES = [
	{ id: "badge", label: "Badge" },
	{ id: "countdown", label: "Timer" },
	{ id: "timeline", label: "Day" },
];

/**
 * @typedef {object} PeakView
 * @property {"peak" | "soon" | "off"} state
 * @property {number} now
 * @property {number} start   the window going on now, or else the next one
 * @property {number} end
 * @property {{ start: number, end: number }[]} day   windows that overlap the local day
 * @property {number} dayStart   local midnight
 * @property {number} dayEnd
 * @property {boolean} twelve   AM/PM instead of a 24-hour clock
 * @property {string} [tag]
 */

const STATES = {
	peak: { word: "PEAK", color: COLORS.orange },
	soon: { word: "SOON", color: COLORS.yellow },
	off: { word: "OFF-PEAK", color: COLORS.green },
};

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** "ends in 2h13m" or "peak in 16h30m". */
const whenLine = (v) => (v.state === "peak" ? `ends in ${formatDuration(v.end - v.now)}` : `peak in ${formatDuration(v.start - v.now)}`);

/** The current or next window in local time: "15:00–21:00" or "5–11 AM", with the weekday when it is another day. */
function windowLine(v) {
	const day = sameDay(v.start, v.now) ? "" : `${new Date(v.start).toLocaleDateString("en-US", { weekday: "short" })} `;
	return `${day}${clockRange(v.start, v.end, v.twelve)}`;
}

/** Small text that shrinks a little when it would not fit, e.g. "Wed 9:30 AM–3:30 PM". */
const small = (y, size, color, content) => text(72, y, Math.min(size, Math.floor(132 / textWidth(content, 1))), color, esc(content));

/** A state word as large as fits, centred around y = 70. */
function bigWord(word, color, max = 40, y = 70) {
	const size = Math.min(max, Math.floor(126 / labelWidth(word, 1)));
	return text(72, y + size * 0.36, size, color, esc(word));
}

const STYLES = {
	badge(v) {
		const st = STATES[v.state];
		return [bigWord(st.word, st.color), small(110, 14, COLORS.white, whenLine(v)), small(134, 13, COLORS.gray, windowLine(v))];
	},

	countdown(v) {
		const st = STATES[v.state];
		const left = formatDuration(v.state === "peak" ? v.end - v.now : v.start - v.now);
		const bottom = v.state === "peak" ? `peak until ${clockTime(v.end, v.twelve)}` : windowLine(v);
		return [
			valueWithUnit(72, 80, fitSize(left, "", 126, 40), COLORS.white, left, ""),
			text(72, 101, 12, COLORS.gray, v.state === "peak" ? "until peak ends" : "until peak"),
			small(133, 14, st.color, bottom),
		];
	},

	timeline(v) {
		const st = STATES[v.state];
		const [x0, w, y, h] = [12, 120, 74, 18];
		const x = (t) => x0 + (w * (Math.min(Math.max(t, v.dayStart), v.dayEnd) - v.dayStart)) / (v.dayEnd - v.dayStart);
		const out = [bigWord(st.word, st.color, 22, 52), rect(x0, y, w, h, COLORS.track, { rx: 4 })];
		for (const win of v.day) out.push(rect(x(win.start), y, x(win.end) - x(win.start), h, COLORS.orange, { rx: 3, opacity: win.end <= v.now ? 0.4 : 1 }));
		const nx = x(v.now).toFixed(1);
		out.push(`<line x1="${nx}" y1="${y - 5}" x2="${nx}" y2="${y + h + 5}" stroke="${COLORS.white}" stroke-width="2.5" stroke-linecap="round"/>`);
		const ticks = v.twelve ? ["12a", "6a", "12p", "6p", "12a"] : ["0", "6", "12", "18", "24"];
		ticks.forEach((label, i) => {
			const anchor = i === 0 ? "start" : i === 4 ? "end" : "middle";
			out.push(text(x0 + (w * i) / 4, y + h + 15, 10, COLORS.gray, label, { anchor }));
		});
		out.push(small(136, 13, COLORS.gray, windowLine(v)));
		return out;
	},
};

/** @param {PeakView} view */
export function renderPeak(style, view) {
	const draw = STYLES[style] ?? STYLES.badge;
	return svg([header("PEAK HOURS", { tag: view.tag }), ...draw(view)]);
}
