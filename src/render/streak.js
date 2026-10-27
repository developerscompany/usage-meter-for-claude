// Streak key: days in a row with Claude Code, and the last five weeks as a grid.
import { COLORS, esc, fitSize, header, rect, svg, text, valueWithUnit } from "./svg.js";

export const STREAK_STYLES = [
	{ id: "days", label: "Days" },
	{ id: "calendar", label: "Calendar" },
];

/**
 * @typedef {object} StreakView
 * @property {number} current       days in a row up to today, or up to yesterday while today has none yet
 * @property {number} best          longest run in the kept days
 * @property {boolean} todayActive
 * @property {boolean} capped       the run may go back further than the kept days
 * @property {number[]} days        requests per day for the last 35 days, today last
 * @property {Date} now
 */

// green once today counts, orange while today still has to, gray without a streak
const colorOf = (v) => (v.current === 0 ? COLORS.gray : v.todayActive ? COLORS.green : COLORS.orange);
const countOf = (v) => (v.capped ? `${v.current}+` : String(v.current));
const OPACITY = [0, 0.35, 0.55, 0.78, 1];

const STYLES = {
	days(v) {
		const value = countOf(v);
		const out = [
			valueWithUnit(72, 80, fitSize(value, "", 110, 52), colorOf(v), value, ""),
			text(72, 98, 12, COLORS.gray, v.current === 1 ? "day in a row" : "days in a row"),
		];
		// the last 7 days, today on the right
		v.days.slice(-7).forEach((n, i) => {
			const today = i === 6 ? { stroke: COLORS.white, strokeWidth: 1.5 } : {};
			out.push(rect(13 + i * 17.5, 106, 13, 13, n > 0 ? COLORS.green : COLORS.track, { rx: 3, ...today }));
		});
		out.push(text(72, 138, 13, COLORS.gray, esc(v.todayActive || v.current === 0 ? `best ${v.best}` : "today: not yet")));
		return out;
	},

	calendar(v) {
		// five weeks, Monday first; this week is the bottom row
		const weekday = (v.now.getDay() + 6) % 7;
		const max = Math.max(1, ...v.days);
		const out = [];
		for (let row = 0; row < 5; row++) {
			for (let col = 0; col < 7; col++) {
				const back = (4 - row) * 7 + (weekday - col);
				if (back < 0) continue; // later this week
				const n = v.days[v.days.length - 1 - back] ?? 0;
				const level = n > 0 ? Math.max(1, Math.ceil((4 * n) / max)) : 0;
				const [x, y] = [14 + col * 17, 36 + row * 17];
				out.push(rect(x, y, 14, 14, COLORS.track, { rx: 3 }));
				if (level) out.push(rect(x, y, 14, 14, COLORS.green, { rx: 3, opacity: OPACITY[level] }));
				if (back === 0) out.push(rect(x, y, 14, 14, "none", { rx: 3, stroke: COLORS.white, strokeWidth: 1.5 }));
			}
		}
		const days = v.current === 1 ? "day" : "days";
		out.push(text(72, 137, 13, colorOf(v), esc(`${countOf(v)} ${days} · best ${v.best}`)));
		return out;
	},
};

/** @param {StreakView} view */
export function renderStreak(style, view) {
	const draw = STYLES[style] ?? STYLES.days;
	return svg([header("STREAK"), ...draw(view)]);
}
